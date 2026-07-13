# AI Cockpit Desktop

AI Cockpit 的 macOS 和 Windows 桌面应用。Tauri 负责窗口、托盘、进程生命周期和本地数据边界，随包携带的 Node 服务负责 API 转发、账号额度与自动切换。

The desktop app keeps runtime state in the platform application data directory:

```text
macOS:   ~/Library/Application Support/AI Cockpit/
Windows: %APPDATA%\AI Cockpit\
```

构建准备脚本会把必要的服务文件复制到 `desktop/src-tauri/resources/airouter/`，并把对应平台的 Node.js sidecar 放入 `desktop/src-tauri/binaries/`。旧网页管理台、浏览器扩展和命令启动器不属于桌面产品，也不会打进安装包。

## Code structure

- `src/app.js`：页面启动与事件编排。
- `src/account-model.js`：账号筛选、排序和展示格式。
- `src/state.js`：快照与界面状态。
- `src/tauri-api.js`：Tauri 命令边界和浏览器 mock。
- `src/theme.js`：主题偏好与系统主题联动。
- `src/update.js`：版本比较、GitHub Release 检查与缓存。
- `src/styles/`：按页面职责拆分的样式。
- `src-tauri/src/runtime.rs`：运行目录与资源同步。
- `src-tauri/src/desktop_data.rs`：桌面快照和配置持久化。
- `src-tauri/src/service.rs`：服务进程与端口管理。
- `src-tauri/src/commands.rs`：异步 Tauri 命令。
- `src-tauri/src/shell.rs`：窗口和托盘行为。

## Development

```bash
cd desktop
npm install
npm run prepare
npm run dev
```

If `npm` is unavailable in the shell, install or use a Node.js distribution that includes npm for Tauri CLI dependency installation. The packaged app itself does not rely on system Node.js.

The preparation scripts can be run with plain Node.js:

```bash
node scripts/prepare-resources.mjs
node scripts/prepare-node.mjs
```

## Build

普通用户请前往 [GitHub Releases](https://github.com/iiiiuuuuuu/ai-cockpit/releases) 下载对应平台的安装包。以下命令仅用于开发构建。

```bash
cd desktop
npm run build
```

Build only the current platform installer:

```bash
npm run build:macos
npm run build:windows
```

`build:macos` creates a signed `.dmg` for the current Mac architecture. `build:macos:app` creates only the signed `.app` bundle for local inspection. `build:windows` creates a Windows NSIS installer (`.exe`). GitHub Releases are produced by the tag workflow in `.github/workflows/release.yml`; it builds separate macOS DMGs for Apple Silicon and Intel runners.
