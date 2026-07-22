# Sub2API Agent Identity 兼容实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AI Cockpit 完整支持新版 Sub2API Agent Identity 账号，并保持普通 Token、API Key 及现有桌面端工作流不回归。

**Architecture:** 新增独立的 Agent Identity 适配模块，负责密码学、请求头和 task 生命周期；配置编辑器负责导入规范化，账号管理器负责额度流程，`openai.js` 负责组装和请求重试，桌面端只消费标准化账号模型并显示轻量 Sub2API 标签。Sub2API 继续作为 Token 子类型，不增加新的路由模式。

**Tech Stack:** Node.js CommonJS、Express、Node `crypto`、`tweetnacl`、`blakejs`、Node Test Runner、原生 HTML/CSS/ES Modules、Tauri 资源打包。

---

## 文件地图

- Create: `app/accounts/sub2api-agent-identity.js` - Agent Identity 校验、签名、请求头、任务注册/解密/恢复。
- Modify: `app/config/openai-config.js` - Sub2API 配置校验、运行时配置和鉴权头选择。
- Modify: `app/config/config-editor.js` - Sub2API 导入、更新和深拷贝。
- Modify: `app/config/runtime-config-reconciler.js` - Sub2API 运行时身份保持。
- Modify: `app/accounts/account-manager.js` - 额度检查前置任务准备和任务失效重试。
- Modify: `app/protocols/claude-messages-handler.js` - Messages 兼容链路任务准备和恢复。
- Modify: `openai.js` - 组装任务管理器、持久化 task、普通代理和 Images 链路接入。
- Modify: `package.json`, `package-lock.json` - 添加 `tweetnacl` 和 `blakejs`。
- Modify: `desktop/src/account-import.js`, `desktop/src/batch-import.js` - 自动识别 Sub2API 导出和重复身份。
- Modify: `desktop/src/account-model.js`, `desktop/src/app.js`, `desktop/index.html` - 类型标签、搜索字段、解析预览和编辑表单。
- Modify: `desktop/src/account-export.js`, `desktop/src/batch-export.js` - 保留 Sub2API subtype 和 credentials。
- Modify: `desktop/src/styles/accounts.css`, `desktop/src/styles/dialogs.css` - Sub2API 标签和凭证字段布局。
- Modify: `desktop/src/tauri-api.js`, `desktop/src-tauri/resources/airouter/package.json`, `desktop/src-tauri/resources/airouter/package-lock.json` - 桌面资源同步。
- Create/Modify tests in: `test/accounts`, `test/config`, `test/protocols`, `test/http`, `test/desktop`, `test/integration`。

### Task 1: 添加 Agent Identity 依赖与密码学模块

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `app/accounts/sub2api-agent-identity.js`
- Test: `test/accounts/sub2api-agent-identity.test.js`

- [ ] **Step 1: 写失败测试，锁定配置判断和签名行为**

在 `test/accounts/sub2api-agent-identity.test.js` 先覆盖：

```js
test('识别完整的 Sub2API Agent Identity 配置', () => {
  assert.equal(isSub2ApiConfig({
    type: 'token',
    subtype: 'sub2api',
    credentials: validCredentials,
  }), true);
});

test('使用 Ed25519 私钥生成可验证的 AgentAssertion', () => {
  const assertion = buildAgentAssertion(config, { now: 0 });
  const payload = JSON.parse(Buffer.from(assertion.split(' ')[1], 'base64url').toString());
  assert.equal(payload.task_id, 'task-1');
  assert.equal(crypto.verify(null, Buffer.from(`runtime-1:task-1:${payload.timestamp}`), publicKey, Buffer.from(payload.signature, 'base64')), true);
});

test('拒绝缺少四个核心字段或非法私钥的配置', () => {
  assert.throws(() => normalizeSub2ApiCredentials({ auth_mode: 'agentIdentity' }), /agent_runtime_id/);
  assert.throws(() => normalizeSub2ApiCredentials({ ...validCredentials, agent_private_key: 'bad' }), /agent_private_key/);
});
```

- [ ] **Step 2: 运行测试确认按预期失败**

Run: `node --test test/accounts/sub2api-agent-identity.test.js`

Expected: FAIL because the new module and exported functions do not exist.

- [ ] **Step 3: 添加依赖并实现最小模块**

运行 `npm install --save blakejs@^1.2.1 tweetnacl@^1.0.3`，在模块中实现并导出：

```js
isSub2ApiConfig(config)
isSub2ApiExportItem(item)
normalizeSub2ApiCredentials(credentials, options)
parseAgentPrivateKey(encodedPrivateKey)
buildAgentAssertion(config, options)
buildSub2ApiAuthHeaders(config, options)
isSub2ApiTaskInvalidResponse(statusCode, body)
```

要求：私钥只接受 Base64 PKCS#8 Ed25519，校验错误不得拼出私钥；`task_id` 允许缺省；`purpose=quota` 和默认 Responses 使用不同固定请求头。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/accounts/sub2api-agent-identity.test.js`

Expected: PASS，且 `git diff --check` 无输出。

- [ ] **Step 5: 提交独立变更**

```bash
git add package.json package-lock.json app/accounts/sub2api-agent-identity.js test/accounts/sub2api-agent-identity.test.js
git commit -m 'Feature: Sub2API Agent Identity 鉴权模块; Subject: 增加签名与请求头适配;'
```

### Task 2: 实现 task 注册、解密和并发恢复

**Files:**
- Modify: `app/accounts/sub2api-agent-identity.js`
- Test: `test/accounts/sub2api-agent-identity.test.js`

- [ ] **Step 1: 添加失败测试**

覆盖：注册请求 URL/body、明文 `task_id` 响应、加密 `encrypted_task_id` 响应、缺少 task 时 `ensureTask` 注册、同一身份并发调用只发出一次请求、旧 task 只允许一次恢复。

```js
test('同一个 Agent Identity 并发确保 task 时只注册一次', async () => {
  let registrations = 0;
  const manager = createSub2ApiAgentIdentityManager({
    requestBufferedFn: async () => {
      registrations += 1;
      return { statusCode: 200, bodyText: JSON.stringify({ task_id: 'task-new' }) };
    },
    persistTaskFn: async ({ taskId }) => taskId,
  });
  await Promise.all([manager.ensureTask(config), manager.ensureTask(config)]);
  assert.equal(registrations, 1);
  assert.equal(config.credentials.task_id, 'task-new');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/accounts/sub2api-agent-identity.test.js`

Expected: FAIL because task manager functions are not implemented.

- [ ] **Step 3: 实现任务管理器**

实现并导出：

```js
buildTaskRegistrationRequest(config, options)
parseTaskRegistrationResponse(config, result)
decryptAgentTaskId(config, encodedCiphertext)
createSub2ApiAgentIdentityManager(options)
```

注册使用 `POST https://auth.openai.com/api/accounts/v1/agent/{agent_runtime_id}/task/register`；设置 30 秒超时和 64 KiB 最大响应；支持 `task_id` 或加密 `encrypted_task_id`；以 `sub2api:chatgpt_account_id:agent_runtime_id` 合并并发恢复。

- [ ] **Step 4: 运行专项测试**

Run: `node --test test/accounts/sub2api-agent-identity.test.js`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add app/accounts/sub2api-agent-identity.js test/accounts/sub2api-agent-identity.test.js
git commit -m 'Feature: Sub2API Agent Identity 任务恢复; Subject: 增加 task 注册解密与并发合并;'
```

### Task 3: 接入配置校验、导入和运行时身份

**Files:**
- Modify: `app/config/openai-config.js`, `app/config/config-editor.js`, `app/config/runtime-config-reconciler.js`
- Test: `test/config/config-editor.test.js`, `test/config/runtime-config-reconciler.test.js`

- [ ] **Step 1: 添加失败测试**

验证 Sub2API 导出对象转换为 `type=token/subtype=sub2api`，缺 task 可导入，非法私钥被拒绝且错误不含原值；运行时配置使用 ChatGPT Account ID；同一 Agent Runtime 修改描述后保留 runtime 状态。

- [ ] **Step 2: 运行配置测试确认失败**

Run: `node --test test/config/config-editor.test.js test/config/runtime-config-reconciler.test.js`

Expected: 新增用例 FAIL，普通账号既有用例保持 PASS。

- [ ] **Step 3: 实现导入和配置规范化**

在配置编辑器中识别 `platform=openai`、`type=oauth`、`credentials.auth_mode=agentIdentity`，转换为：

```js
{
  type: 'token',
  subtype: 'sub2api',
  description: credentials.email || item.name || credentials.chatgpt_account_id,
  credentials: normalizeSub2ApiCredentials(credentials),
}
```

更新配置时深拷贝 `credentials`；Sub2API 删除普通 `access_token`、`refresh_token`、`client_id`、`account_id` 顶层字段；运行时 identity 加入 `agent_runtime_id`。

- [ ] **Step 4: 运行配置测试确认通过**

Run: `node --test test/config/config-editor.test.js test/config/runtime-config-reconciler.test.js`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add app/config/openai-config.js app/config/config-editor.js app/config/runtime-config-reconciler.js test/config/config-editor.test.js test/config/runtime-config-reconciler.test.js
git commit -m 'Feature: Sub2API Agent Identity 配置导入; Subject: 支持配置校验规范化与运行时身份;'
```

### Task 4: 接入额度检查、Responses、Messages 和 Images

**Files:**
- Modify: `app/accounts/account-manager.js`, `app/protocols/claude-messages-handler.js`, `openai.js`
- Test: `test/accounts/account-manager.test.js`, `test/protocols/responses-failover.test.js`, `test/http/upstream-request.test.js`, `test/integration/proxy-boundary.test.js`

- [ ] **Step 1: 添加失败测试**

为每条路径加入一个最小行为测试：额度检查缺 task 先注册；额度 401 `invalid_task_id` 恢复后重试一次；Responses 代理使用动态 Assertion；Messages 兼容和 Images 请求同样确保 task；普通 401 不触发 task 恢复。

- [ ] **Step 2: 运行专项测试确认失败**

Run: `node --test test/accounts/account-manager.test.js test/protocols/responses-failover.test.js test/http/upstream-request.test.js test/integration/proxy-boundary.test.js`

Expected: 新增 Sub2API 用例 FAIL，普通路径测试不因测试代码错误而失败。

- [ ] **Step 3: 连接任务管理器**

在 `openai.js` 创建一个共享的 `createSub2ApiAgentIdentityManager` 实例，注入：

```js
ensureSub2ApiTaskFn: config => manager.ensureTask(config)
recoverSub2ApiTaskFn: (config, expectedTaskId) => manager.recoverTask(config, expectedTaskId)
```

持久化函数只更新匹配 `expectedTaskId` 的配置项。代理请求开始前调用 `ensureTask`；上游响应仅在状态码 401 且正文命中明确 task 失效标记时恢复并重试一次。额度 JSON 解析错误单独记录，不把异常正文当作有效额度。

- [ ] **Step 4: 接入三条协议和额度路径**

`account-manager.js` 在额度请求前确保 task，并在 Sub2API 任务失效后重新执行一次额度请求；`claude-messages-handler.js` 在选中账号后、发起 Responses 转换前确保 task；`openai.js` 的 Images business attempt 使用相同 ensure/recover 回调。

- [ ] **Step 5: 运行专项测试确认通过**

Run: `node --test test/accounts/account-manager.test.js test/protocols/responses-failover.test.js test/http/upstream-request.test.js test/integration/proxy-boundary.test.js`

Expected: PASS，普通 Token 的 refresh-token 逻辑仍然通过原测试。

- [ ] **Step 6: 提交**

```bash
git add app/accounts/account-manager.js app/protocols/claude-messages-handler.js openai.js test/accounts/account-manager.test.js test/protocols/responses-failover.test.js test/http/upstream-request.test.js test/integration/proxy-boundary.test.js
git commit -m 'Feature: Sub2API Agent Identity 请求链路; Subject: 接入额度代理与任务失效重试;'
```

### Task 5: 更新桌面端解析、展示、编辑和导出

**Files:**
- Modify: `desktop/src/account-import.js`, `desktop/src/batch-import.js`, `desktop/src/account-model.js`, `desktop/src/account-export.js`, `desktop/src/batch-export.js`, `desktop/src/app.js`, `desktop/index.html`, `desktop/src/styles/accounts.css`, `desktop/src/styles/dialogs.css`
- Test: `test/desktop/account-import.test.js`, `test/desktop/batch-import.test.js`, `test/desktop/account-model.test.js`

- [ ] **Step 1: 添加失败测试**

覆盖单个 Agent Identity 对象、多个 Agent Identity 数组、AI Cockpit 导出文件、批次重复识别、标题优先级、Sub2API 标签和导出后 credentials 保真。

```js
test('批量导入自动识别 Sub2API 为 Token 子类型', () => {
  const [record] = parseBatchAccountSources([{ name: 'sub2api.json', content: JSON.stringify(exported) }]);
  assert.equal(record.account.mode, 'token');
  assert.equal(record.account.subtype, 'sub2api');
  assert.equal(record.error, '');
});
```

- [ ] **Step 2: 运行桌面测试确认失败**

Run: `node --test test/desktop/account-import.test.js test/desktop/batch-import.test.js test/desktop/account-model.test.js`

Expected: 新增用例 FAIL，现有普通 Token/API Key 用例保持可执行。

- [ ] **Step 3: 扩展解析模型**

在 `parseTokenJsonObject` 前增加 Sub2API 识别分支；规范化为 `{ mode: 'token', subtype: 'sub2api', credentials, description, ... }`。重复识别使用 `subtype + chatgpt_account_id + agent_runtime_id`，普通 Token 仍使用原来的 Account ID/Token 规则。

- [ ] **Step 4: 修改 UI 但保持两种顶层模式**

在 Token 卡片增加 `Sub2API` 小标签；Token 表单解析成功后显示来源类型；编辑 Sub2API 时显示邮箱和只读技术资料，私钥使用现有眼睛按钮，整体凭证替换通过 JSON 解析入口完成；批量预览的类型列显示 `Token · Sub2API`。搜索增加邮箱、ChatGPT Account ID、Agent Runtime ID。

- [ ] **Step 5: 保证导出保真**

导出映射不得把 Sub2API credentials 展平为 `access_token`；保留 `type`、`subtype`、完整 credentials 以及本地生命周期字段。导出提示明确包含 Agent 私钥。

- [ ] **Step 6: 运行桌面测试确认通过**

Run: `node --test test/desktop/account-import.test.js test/desktop/batch-import.test.js test/desktop/account-model.test.js`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add desktop/index.html desktop/src/account-import.js desktop/src/batch-import.js desktop/src/account-model.js desktop/src/account-export.js desktop/src/batch-export.js desktop/src/app.js desktop/src/styles/accounts.css desktop/src/styles/dialogs.css test/desktop
git commit -m 'Feature: Sub2API Agent Identity 桌面支持; Subject: 增加导入展示编辑与导出保真;'
```

### Task 6: 同步 Tauri 资源并加入回归测试

**Files:**
- Modify: `desktop/src/tauri-api.js`, `desktop/src-tauri/resources/airouter/package.json`, `desktop/src-tauri/resources/airouter/package-lock.json`, 相关资源同步脚本或架构测试。
- Test: `test/architecture/repository-boundary.test.js`, `test/architecture/release-workflow.test.js`, `test/integration/run.test.js`

- [ ] **Step 1: 添加资源一致性测试**

验证桌面资源目录包含 `app/accounts/sub2api-agent-identity.js`，两份 package manifest 都声明 `blakejs` 和 `tweetnacl`，且服务启动时能够加载资源依赖。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/architecture/repository-boundary.test.js test/architecture/release-workflow.test.js test/integration/run.test.js`

Expected: 资源一致性用例 FAIL，指出 desktop resource 尚未同步。

- [ ] **Step 3: 同步服务资源**

按当前仓库已有资源同步方式复制生产代码和 lockfile 到 `desktop/src-tauri/resources/airouter`，不复制测试、文档和本机账号数据。确认 Tauri 打包使用的 Node runtime 能解析新增 CommonJS 依赖。

- [ ] **Step 4: 运行资源和集成测试**

Run: `node --test test/architecture/repository-boundary.test.js test/architecture/release-workflow.test.js test/integration/run.test.js`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add desktop/src/tauri-api.js desktop/src-tauri/resources/airouter test/architecture test/integration/run.test.js
git commit -m 'Feature: Sub2API Agent Identity 桌面资源; Subject: 同步运行时依赖并增加打包校验;'
```

### Task 7: 完整验证与文档更新

**Files:**
- Modify: `docs/配置字段参考.md`, `docs/账号导入导出与迁移.md`, `README.md`（仅补充 Sub2API 用户可见说明）
- Test: all existing tests plus new Sub2API tests

- [ ] **Step 1: 更新用户文档**

说明新版 Sub2API JSON 的识别条件、导入方式、Task 自动维护、额度展示和导出文件包含敏感私钥；不暴露内部签名实现细节作为用户操作步骤。

- [ ] **Step 2: 运行完整测试**

Run: `npm test`

Expected: 所有测试 PASS，无未处理的 promise rejection、敏感字段日志或资源路径错误。

- [ ] **Step 3: 做静态敏感信息检查**

Run: `rg -n "agent_private_key|authorization" app openai.js desktop/src | rg "console\.log|console\.error|log\(|warn\(" || true`

Expected: 不存在将私钥或完整 Authorization 直接写入日志的代码。

- [ ] **Step 4: 检查工作区与差异**

Run: `git diff --check && git status --short && git diff master...HEAD --stat`

Expected: 无空白错误；只包含本功能文件；不包含账号数据、构建产物和临时文件。

- [ ] **Step 5: 最终提交**

```bash
git add README.md docs/配置字段参考.md docs/账号导入导出与迁移.md
git commit -m 'Feature: Sub2API Agent Identity 用户文档; Subject: 补充导入迁移与安全说明;'
```

## 完成检查

- [ ] 普通 Token、API Key 回归测试通过。
- [ ] Sub2API 单对象、数组和 AI Cockpit 导出均可导入。
- [ ] 缺失或失效 task 可自动注册/恢复且最多重试一次。
- [ ] 额度、Responses、Messages、Images 链路均覆盖。
- [ ] 桌面卡片、编辑、导出和重复检测正确。
- [ ] Tauri 资源包含新增源码和依赖。
- [ ] 文档、`npm test`、敏感日志检查均通过。
