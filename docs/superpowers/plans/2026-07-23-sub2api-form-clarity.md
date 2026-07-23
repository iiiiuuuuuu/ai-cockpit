# Sub2API 表单可读性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Token 账号弹窗在识别 Sub2API Agent Identity JSON 后，仅展示适用的身份字段与说明，并提供 Sub2API JSON 格式示例。

**Architecture:** 保持 Sub2API 为 Token 子类型。`desktop/index.html` 提供可切换的表单节点和示例内容，`desktop/src/app.js` 基于 `state.accountModalSubtype` 控制可见性、必填状态和提交文案；桌面启动测试检查静态 DOM 契约，避免后续页面重构删掉关键节点。

**Tech Stack:** HTML、CSS、ES modules、Node.js 内置 test runner。

---

### Task 1: 锁定 Sub2API 表单节点契约

**Files:**
- Modify: `test/desktop/desktop-boot.test.js`

- [ ] **Step 1: 编写失败测试**

在现有桌面 HTML 结构测试中加入断言，要求存在 `data-standard-token-only`、`data-sub2api-account-id`、`data-token-format="sub2api"` 和 `data-token-format-example="sub2api"`：

```js
assert.match(html, /data-standard-token-only/);
assert.match(html, /data-sub2api-account-id/);
assert.match(html, /data-token-format="sub2api"/);
assert.match(html, /data-token-format-example="sub2api"/);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/desktop/desktop-boot.test.js`

Expected: FAIL，缺少新的 Sub2API 表单节点。

- [ ] **Step 3: 实现最小页面节点**

在 Token 表单中为普通凭证和客户端 ID 标记 `data-standard-token-only`；增加只读的 ChatGPT Account ID 节点；新增 Sub2API 格式示例标签与 JSON 内容。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/desktop/desktop-boot.test.js`

Expected: PASS。

### Task 2: 根据导入类型切换表单

**Files:**
- Modify: `desktop/src/app.js`
- Test: `test/desktop/desktop-boot.test.js`

- [ ] **Step 1: 编写失败测试**

补充静态契约断言，要求脚本查询 `data-standard-token-only` 和 `data-sub2api-account-id`，并在 `setSub2ApiFieldsVisible` 中更新普通 Token 区域、账户 ID 与提交文案。

```js
assert.match(appScript, /standardTokenFields/);
assert.match(appScript, /sub2ApiAccountIdInput/);
assert.match(appScript, /添加 Sub2API 账号/);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/desktop/desktop-boot.test.js`

Expected: FAIL，脚本尚未有对应元素和文案。

- [ ] **Step 3: 实现最小状态切换**

扩展元素引用与 `setSub2ApiFieldsVisible`：Agent Identity 时隐藏标准 Token 字段、移除普通访问令牌必填约束、填充只读 ChatGPT Account ID、显示身份字段；普通 Token 时恢复默认状态。新建 Sub2API 账号将提交按钮改为“添加 Sub2API 账号”。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/desktop/desktop-boot.test.js`

Expected: PASS。

### Task 3: 完善身份字段文案并回归验证

**Files:**
- Modify: `desktop/index.html`
- Modify: `desktop/src/styles/dialogs.css`
- Test: `test/desktop/desktop-boot.test.js`

- [ ] **Step 1: 编写失败测试**

断言 HTML 包含“无需访问令牌”、Task 自动维护说明和私钥本机签名说明：

```js
assert.match(html, /无需访问令牌/);
assert.match(html, /缺失或失效时由服务自动创建/);
assert.match(html, /仅在本机生成签名/);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/desktop/desktop-boot.test.js`

Expected: FAIL，缺少确认的说明文案。

- [ ] **Step 3: 实现紧凑说明样式**

为 Sub2API 身份区块增加简洁的标题说明和字段辅助文字，复用已有 `.field small` 样式，仅为只读身份字段补充必要的间距与换行保护。

- [ ] **Step 4: 运行完整回归**

Run: `node --test test/desktop/desktop-boot.test.js && npm test && cargo test --manifest-path desktop/src-tauri/Cargo.toml && git diff --check`

Expected: 全部通过且无空白错误。
