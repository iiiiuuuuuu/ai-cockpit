# Sub2API Agent Identity 兼容设计

## 背景

Sub2API 新版 OpenAI OAuth 导出不再使用普通 `access_token` 作为请求凭证，而是使用 Agent Identity。账号通过 Ed25519 私钥动态签名，并依赖可失效、可重新注册的 `task_id` 完成上游鉴权。

AI Cockpit 当前只识别普通 Token 和 API Key。现有单账号导入、批量导入、配置规范化、额度检查和代理请求都假定 Token 账号包含 `access_token`，因此新版 Sub2API 账号会在导入阶段被拒绝，不能通过只增加界面标签解决。

## 目标

- 完整支持 Sub2API Agent Identity 账号的导入、保存、编辑、导出和跨平台迁移。
- 让 Sub2API 账号参与现有 Token 主链路，包括自动切换、会话保持、额度轮询、手动刷新和故障转移。
- 覆盖 Responses、Claude Messages 兼容和 Images 请求。
- 保持产品中的两种账号模式：Token 和 API Key。Sub2API 是 Token 的子类型，不增加第三种顶层模式。
- 对 Agent 私钥实施与 Token、API Key 一致或更严格的本地敏感信息保护。

## 非目标

- 不把普通 Token 转换成 Agent Identity，也不尝试将 Agent Identity 转换成普通 Token。
- 不新增 Sub2API 服务端管理功能。
- 不改变现有普通 Token 和 API Key 的调度优先级。
- 不在卡片上展示 `task_id`、私钥等技术字段。

## 配置模型

普通 Token 配置保持不变：

```json
{
  "type": "token",
  "description": "user@example.com",
  "account_id": "account-id",
  "access_token": "access-token",
  "refresh_token": "refresh-token"
}
```

Sub2API Agent Identity 保存为 Token 子类型：

```json
{
  "type": "token",
  "subtype": "sub2api",
  "description": "user@example.com",
  "credentials": {
    "auth_mode": "agentIdentity",
    "agent_runtime_id": "agent-runtime-id",
    "agent_private_key": "base64-pkcs8-ed25519-private-key",
    "task_id": "task-id",
    "chatgpt_account_id": "account-id",
    "chatgpt_user_id": "user-id",
    "chatgpt_account_is_fedramp": false,
    "email": "user@example.com",
    "plan_type": "team"
  }
}
```

`agent_runtime_id`、`agent_private_key`、`chatgpt_account_id` 和 `chatgpt_user_id` 必填。`task_id` 可选，缺失时由服务在首次使用前注册。`email`、`plan_type` 和 FedRAMP 标记属于展示或请求附加信息。

配置校验只接受 `type=token`、`subtype=sub2api` 这一种 Token 子类型。私钥必须是 Base64 编码的 PKCS#8 Ed25519 私钥。校验错误只说明字段不合法，不回显私钥内容。

## 模块边界

新增 `app/accounts/sub2api-agent-identity.js`，集中负责：

- 判断内部配置和 Sub2API 导出对象。
- 规范化并校验 Agent Identity credentials。
- 生成 Responses 和额度检查所需的请求头。
- 生成动态 `AgentAssertion`。
- 注册、解密和恢复 `task_id`。
- 对同一 Agent Identity 的并发恢复请求进行合并。

现有模块按职责接入：

- `app/config/openai-config.js`：配置校验、运行时配置构建和鉴权头分发。
- `app/config/config-editor.js`：导入转换、深拷贝、更新与持久化格式。
- `app/config/runtime-config-reconciler.js`：以账号 ID 和 Agent Runtime ID 识别同一运行时账号。
- `app/accounts/account-manager.js`：额度检查前确保任务存在，任务失效时恢复并重试一次。
- `app/protocols/claude-messages-handler.js`：Claude Messages 转 Responses 链路的任务准备与恢复。
- `openai.js`：组装依赖、持久化新 `task_id`，并覆盖普通 Responses 和 Images 请求链路。

Sub2API 代码不并入 `account-manager.js`，避免账号调度模块同时承担密码学和任务生命周期职责。

## 导入与重复识别

单账号 JSON 解析和批量文件导入都自动识别以下格式：

1. 普通 AuthSession 或 `auth.json`：包含 `access_token`，保存为普通 Token。
2. 旧版 Sub2API OAuth 导出：`credentials` 中包含 `access_token`，保存为普通 Token。
3. 新版 Sub2API Agent Identity 导出：`platform=openai`、`type=oauth` 且 `credentials.auth_mode=agentIdentity`，保存为 Sub2API Token。
4. AI Cockpit 自身导出：已经是 `type=token`、`subtype=sub2api`，直接规范化后导入。

Agent Identity 的强身份键为：

```text
sub2api + chatgpt_account_id + agent_runtime_id
```

批量文件内和已有账号均使用该身份键判断重复。用户选择“更新已有账号”时，整体替换 credentials，保留本地别名、金额、使用时间、删除状态和排序字段，除非导入文件明确携带这些字段。

## 运行时鉴权与任务恢复

请求发出前执行以下流程：

1. 非 Sub2API 账号保持原逻辑。
2. Sub2API 账号没有 `task_id` 时，向 OpenAI Agent Task 注册接口申请任务。
3. 将注册得到的 `task_id` 原子写回对应配置项，并同步当前运行时对象。
4. 使用 `agent_runtime_id + task_id + 当前 UTC 时间` 生成 Ed25519 签名，构造 `AgentAssertion`。
5. 根据用途生成请求头：Responses 请求和额度检查使用各自的固定头集合。
6. 上游返回 401 且正文明确表示 `invalid_task_id`、任务不存在或过期时，重新注册任务并重试原请求一次。
7. 其他 401 不触发任务恢复，防止错误请求无限重试。

同一账号同时触发多个请求时，共享一个任务注册 Promise。持久化采用期望旧 `task_id` 的比较更新，避免较晚完成的恢复覆盖更新结果。

Agent Identity 不进入普通 Token 的 refresh-token 流程。

## 额度与可用性

Sub2API 仍请求 `/backend-api/wham/usage`，解析结果沿用普通 Token 的 5 小时配额、周配额、重置时间和不可用阈值。

额度检查前确保 `task_id` 存在。任务失效时恢复并重试一次；注册失败、签名失败或额度接口持续失败时，沿用现有连续失败计数和不可用状态，不引入新的调度优先级。

卡片手动刷新和后台并发刷新都复用同一逻辑。

## 桌面端体验

### 账号列表

- Sub2API 账号仍计入 Token 数量和 Token 筛选。
- 在现有 `Token` 标签旁增加低强调度的 `Sub2API` 标签。
- 标题继续遵循“别名 > 邮箱 > Account ID > 未命名”。邮箱来自 `credentials.email`，Account ID 来自 `credentials.chatgpt_account_id`。
- 继续展示 5 小时配额、周配额、当前使用、可用状态和现有卡片操作。
- 搜索覆盖别名、邮箱、ChatGPT Account ID 和 Agent Runtime ID。
- 不在卡片展示私钥、User ID、Runtime ID 或 Task ID。

### 添加与批量导入

- 不增加第三个账号模式。
- Token JSON 输入框自动识别普通 Token 或 Agent Identity。
- “查看格式示例”增加 `Sub2API Agent Identity` 标签页，展示可直接识别的 JSON 结构；私钥以占位符表示，不展示真实私钥。
- 解析成功后，普通 Token 继续显示“登录凭证”区域；识别为 Agent Identity 时，隐藏整个“登录凭证”区域，不显示也不校验 `access_token`、`refresh_token` 和 `client_id`。
- Agent Identity 解析结果显示提示“通过本地身份签名发送请求，无需访问令牌”。账号资料继续可编辑，账号 ID 以 `ChatGPT Account ID` 的名称只读展示。
- 身份区块命名为“Sub2API 身份信息”，字段均只读并附带简短说明：Agent Runtime ID 用于注册和关联 Task；ChatGPT Account ID 用于发送请求；ChatGPT User ID 是关联的用户标识；Task ID 用于请求签名且缺失或失效时自动创建；Agent Private Key 仅在本机生成签名，默认隐藏且可临时显示。
- 新建 Agent Identity 账号时，提交按钮显示“添加 Sub2API 账号”；编辑时显示“保存账号”。
- 批量导入预览的类型列显示“Token · Sub2API”。
- 无效私钥、缺少必填字段和不支持的 `auth_mode` 在预览阶段逐项提示，不阻塞其他有效账号。

### 编辑

Sub2API 编辑页展示：

- 别名、金额、开始时间和停止时间：按现有本地资料规则编辑。
- 邮箱：可编辑，写入 `credentials.email`。
- ChatGPT Account ID、Plan Type、Agent Runtime ID：只读展示。
- Agent Private Key：密码框隐藏展示，支持眼睛按钮查看。
- Task ID：只读展示，并说明由服务自动维护。
- “重新导入身份 JSON”：解析并整体替换 Agent Identity credentials。

不提供零散修改 Runtime ID、User ID、私钥和 Task ID 后直接保存的能力，避免产生无法配套签名的混合身份。

### 导出

AI Cockpit 批量导出保留完整 `subtype` 和 `credentials`，确保 macOS 与 Windows 间可迁移。导出弹窗继续提示文件包含完整敏感凭证，文案扩展为包含 Agent 私钥。

## 安全与日志

- `authorization`、`agent_private_key`、Cookie、代理鉴权和响应 Cookie 不进入访问日志。
- 错误消息不拼接原始 credentials。
- 私钥仅保存在本地配置和用户主动导出的文件中。
- 桌面端默认隐藏私钥；复制或显示属于明确的用户操作。
- Task 注册响应设置超时和最大正文大小，拒绝非 JSON 或缺少任务 ID 的响应。

## 错误处理

- 导入错误：指出缺失或不合法的字段，不输出字段值。
- Task 注册失败：当前请求返回 502，并记录可读的账号级失败原因。
- Task 失效恢复失败：只重试一次，之后进入现有失败处理。
- 配置持久化失败：不只更新内存中的 `task_id`，避免重启后状态不一致。
- 普通 Token、API Key 和非 Sub2API 请求不经过 Agent Identity 分支。

## 测试策略

按 TDD 分层覆盖：

- 单元测试：私钥校验、Assertion 签名、请求头、失效响应识别、Task 注册与并发恢复。
- 配置测试：导入转换、配置校验、深拷贝、运行时配置和身份重建。
- 账号管理测试：额度检查、无 Task 注册、失效恢复、非 JSON 响应和不触发普通 Token 刷新。
- 协议测试：Responses、Claude Messages 和 Images 各自只恢复一次。
- 桌面测试：单账号解析、批量导入、重复识别、账号模型、卡片标签、编辑与导出保真。
- 回归测试：普通 Token 和 API Key 的导入、额度、请求和自动切换保持不变。

完成专项测试后运行完整的 `npm test`，并检查桌面资源打包清单包含新增模块及 `tweetnacl`、`blakejs` 依赖。

## 验收标准

- 新版 Sub2API 单对象、对象数组和 AI Cockpit 导出文件均可导入。
- 导入后卡片显示为 Token 下的 Sub2API 账号，并正常展示额度。
- 缺少 `task_id` 的账号首次请求可自动注册并持久化任务。
- `task_id` 失效后原请求只自动恢复和重试一次。
- Responses、Claude Messages、Images 和额度检查均可使用 Agent Identity。
- 编辑和再次导出不会丢失或破坏 credentials。
- 普通 Token 和 API Key 行为无回归。
