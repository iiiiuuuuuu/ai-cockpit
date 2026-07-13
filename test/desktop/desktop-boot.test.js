const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const desktopDir = path.join(__dirname, '..', '..', 'desktop');

function readDesktopFile(relativePath) {
  return fs.readFileSync(path.join(desktopDir, relativePath), 'utf8');
}

function readDesktopScripts() {
  return ['app.js', 'account-model.js', 'tauri-api.js', 'state.js', 'render.js', 'actions.js']
    .map(file => readDesktopFile(path.join('src', file)))
    .join('\n');
}

function readDesktopRust() {
  return ['main.rs', 'commands.rs', 'desktop_data.rs', 'runtime.rs', 'service.rs', 'shell.rs']
    .map(file => readDesktopFile(path.join('src-tauri', 'src', file)))
    .join('\n');
}

function readDesktopStyles() {
  return ['base.css', 'accounts.css', 'settings.css', 'dialogs.css', 'responsive.css', 'theme.css']
    .map(file => readDesktopFile(path.join('src', 'styles', file)))
    .join('\n');
}

test('desktop app exposes the approved two-page AI Cockpit shell', () => {
  const html = readDesktopFile('index.html');

  assert.match(html, /data-page="accounts"/);
  assert.match(html, /data-page="settings"/);
  assert.match(html, /id="accountsPage"/);
  assert.match(html, /id="settingsPage"/);
  assert.match(html, /id="serviceStatusLabel"/);
  assert.match(html, /AI Cockpit/);

  assert.doesNotMatch(html, /打开管理页/);
  assert.doesNotMatch(html, /管理地址/);
  assert.doesNotMatch(html, /运行日志/);
  assert.doesNotMatch(html, /最近日志/);
  assert.doesNotMatch(html, /重启/);
  assert.doesNotMatch(html, /浏览器打开/);
});

test('accounts page provides search filtering sorting routing summary and account cards', () => {
  const html = readDesktopFile('index.html');
  const segmentedMarkup = html.match(/<div class="segmented"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';

  assert.match(html, /id="accountSearchInput"/);
  assert.match(html, /data-filter-type="all"/);
  assert.match(html, /data-filter-type="token"/);
  assert.match(html, /data-filter-type="apikey"/);
  assert.match(html, /data-filter-type="deleted"/);
  assert.match(html, /data-filter-count="all"/);
  assert.match(html, /data-filter-count="token"/);
  assert.match(html, /data-filter-count="apikey"/);
  assert.match(html, /data-filter-count="deleted"/);
  assert.doesNotMatch(segmentedMarkup, /data-filter-type="deleted"/);
  assert.match(html, /class="deleted-filter-button"[^>]*data-filter-type="deleted"/);
  assert.match(html, /id="accountSortSelect"/);
  assert.match(html, /value="default"/);
  assert.match(html, /value="primaryQuota"/);
  assert.match(html, /value="weeklyQuota"/);
  assert.match(html, /id="sortDirectionButton"/);
  assert.doesNotMatch(html, /id="toggleDeletedAccountsButton"/);
  assert.doesNotMatch(html, /class="deleted-eye"/);
  assert.match(html, /id="routingSummary"/);
  assert.match(html, /id="accountsGrid"/);
  assert.match(html, /id="emptyAccountsState"/);
  assert.match(html, /class="small-button add-account-button" type="button" id="openAddAccountModalButton"/);
  assert.match(html, /class="nav-icon chatgpt-nav-icon"/);
  assert.match(html, /src="\.\/src\/assets\/chatgpt-mark\.png"/);
  assert.ok(fs.existsSync(path.join(desktopDir, 'src', 'assets', 'chatgpt-mark.png')));
  assert.match(html, /class="nav-icon settings-nav-icon"/);
  assert.doesNotMatch(html, /M12 3\.4a4\.2 4\.2/);
  assert.doesNotMatch(html, /id="openSettingsButton"/);
});

test('deleted account filter is visually separate and toggles back to all', () => {
  const script = readDesktopFile('src/app.js');
  const styles = readDesktopFile('src/styles/base.css');

  assert.match(script, /state\.filterType === 'deleted' \? 'all' : 'deleted'/);
  assert.match(styles, /\.deleted-filter-button[\s\S]*height: 36px;[\s\S]*background: #fff;/);
  assert.match(styles, /\.deleted-filter-button\.active[\s\S]*background: var\(--chip\);/);
});

test('account filtering and counts handle active types deleted accounts and search', async () => {
  const accountModelUrl = pathToFileURL(path.join(desktopDir, 'src', 'account-model.js')).href;
  const { filterAccounts, getAccountFilterCounts } = await import(accountModelUrl);
  const accounts = [
    { index: 0, item: { alias: 'Primary', description: 'first@example.com' } },
    { index: 1, item: { alias: 'Backup', description: 'second@example.com' } },
    { index: 2, item: { type: 'apikey', alias: 'API', base_url: 'https://api.example.com' } },
    { index: 3, item: { alias: 'Removed', description: 'removed@example.com', deleted_at: '2026-07-13T10:00:00Z' } },
  ];

  const filtered = filterAccounts(accounts, {
    filterType: 'all',
  }, 'second@example.com');
  const deleted = filterAccounts(accounts, { filterType: 'deleted' }, '');

  assert.deepEqual(filtered.map(account => account.index), [1]);
  assert.deepEqual(deleted.map(account => account.index), [3]);
  assert.deepEqual(getAccountFilterCounts(accounts, ''), {
    all: 3,
    token: 2,
    apikey: 1,
    deleted: 1,
  });
  assert.deepEqual(getAccountFilterCounts(accounts, 'second@example.com'), {
    all: 1,
    token: 1,
    apikey: 0,
    deleted: 0,
  });
});

test('routing summary uses compact preference and switch status groups', () => {
  const html = readDesktopFile('index.html');
  const script = readDesktopFile('src/app.js');
  const styles = readDesktopFile('src/styles/base.css');

  assert.match(html, /使用偏好：Token 优先/);
  assert.match(script, /使用偏好：/);
  assert.match(script, /自动切换：/);
  assert.match(script, /'已关闭' : '已开启'/);
  assert.match(script, /class="separator"/);
  assert.match(styles, /\.routing-summary \.separator[\s\S]*width: 1px;[\s\S]*height: 12px;/);
});

test('search focus uses one container ring instead of a nested input outline', () => {
  const styles = readDesktopFile('src/styles/base.css');

  assert.match(styles, /\.search-field:focus-within[\s\S]*border-color:[^;]+;[\s\S]*box-shadow:[^;]+;/);
  assert.match(styles, /\.search-field input:focus-visible[\s\S]*outline: none;/);
});

test('account modals distinguish token api-key and edit flows', () => {
  const html = readDesktopFile('index.html');

  assert.match(html, /id="accountModal"/);
  assert.match(html, /id="confirmModal"/);
  assert.match(html, /id="confirmModalTitle"/);
  assert.match(html, /id="confirmModalPrimaryButton"/);
  assert.match(html, /id="confirmModalSecondaryButton"/);
  assert.match(html, /data-account-mode="token"/);
  assert.match(html, /data-account-mode="apikey"/);
  assert.match(html, /id="tokenAccessTokenInput"/);
  assert.match(html, /id="tokenJsonInput"/);
  assert.match(html, /id="parseTokenJsonButton"/);
  assert.match(html, /id="apiKeyBaseUrlInput"/);
  assert.match(html, /id="apiKeySecretInput"/);
  assert.match(html, /data-secret-toggle="tokenAccessTokenInput"/);
  assert.match(html, /data-secret-toggle="tokenRefreshTokenInput"/);
  assert.match(html, /data-secret-toggle="apiKeySecretInput"/);
  assert.match(html, /class="secret-eye-icon"/);
  assert.doesNotMatch(html, />明<\/button>/);
  assert.match(html, /id="tokenStartedAtInput" type="datetime-local"/);
  assert.match(html, /id="tokenStoppedAtInput" type="datetime-local"/);
  assert.match(html, /id="apiKeyStartedAtInput" type="datetime-local"/);
  assert.match(html, /id="apiKeyStoppedAtInput" type="datetime-local"/);
  assert.doesNotMatch(html, /StartedAtDateInput|StartedAtTimeInput/);
  assert.doesNotMatch(html, /StoppedAtDateInput|StoppedAtTimeInput/);
  assert.doesNotMatch(html, /id="editAliasInput"/);
  assert.doesNotMatch(html, /id="editSourceValue"/);
  assert.match(html, /class="required-pill">必填/);
  assert.match(html, /class="optional-pill">可选/);
  assert.match(html, /class="dialog-button dialog-button-secondary" type="button" data-close-modal="accountModal">取消/);
  assert.match(html, /class="dialog-button dialog-button-primary" type="submit" id="saveAccountButton"/);
  assert.match(html, /解析后自动填充。/);
  assert.match(html, /请求鉴权 token。/);
  assert.doesNotMatch(html, /class="field required"/);

  assert.doesNotMatch(html, /支持能力/);
  assert.doesNotMatch(html, /Claude/);
});

test('combined date-time fields use minute precision and default new accounts to now', async () => {
  const accountModelUrl = pathToFileURL(path.join(desktopDir, 'src', 'account-model.js')).href;
  const { formatDateTimeLocalValue, readDateTimeInput } = await import(accountModelUrl);
  const localDate = new Date(2026, 6, 13, 12, 30, 45);

  assert.equal(formatDateTimeLocalValue(localDate), '2026-07-13T12:30');
  assert.equal(readDateTimeInput({ value: '2026-07-13T12:30' }), '2026-07-13T12:30');
  assert.equal(readDateTimeInput({ value: '' }), null);

  const script = readDesktopFile('src/app.js');
  assert.match(script, /const defaultStartedAt = formatDateTimeLocalValue\(new Date\(\)\)/);
  assert.match(script, /tokenStartedAtInput\.value = defaultStartedAt/);
  assert.match(script, /apiKeyStartedAtInput\.value = defaultStartedAt/);
});

test('settings page uses grouped local service token and routing preferences', () => {
  const html = readDesktopFile('index.html');

  assert.match(html, /本地服务/);
  assert.match(html, /id="serviceToggleButton"/);
  assert.match(html, /id="settingsServicePortInput"/);
  assert.match(html, /id="settingsProxyPortInput"/);
  assert.match(html, /客户端连接 AI Cockpit 使用的端口；服务运行中修改会立即切换。/);
  assert.match(html, /可选；填写后，上游请求会通过这个本机代理端口转发。/);
  assert.match(html, /访问令牌/);
  assert.match(html, /id="openTokenModalButton"/);
  assert.match(html, /id="accessTokensList"/);
  assert.match(html, /id="toast"/);
  assert.match(html, /点击添加后自动生成/);
  assert.match(html, /使用偏好/);
  assert.match(html, /id="routingPreferenceSelect"/);
  assert.match(html, /id="autoSwitchInput"/);
  assert.match(html, /class="info-dot"/);

  assert.doesNotMatch(html, /开机自启/);
  assert.doesNotMatch(html, /静默启动/);
  assert.doesNotMatch(html, /端口冲突处理/);
  assert.doesNotMatch(html, /令牌校验策略/);
});

test('theme mode supports system light and dark desktop preferences', () => {
  const html = readDesktopFile('index.html');
  const script = readDesktopFile('src/app.js');
  const themeScript = readDesktopFile('src/theme.js');
  const styles = readDesktopStyles();
  const basicSettingsIndex = html.indexOf('aria-label="基础配置"');
  const localServiceIndex = html.indexOf('aria-label="本地服务"');

  assert.ok(basicSettingsIndex >= 0 && basicSettingsIndex < localServiceIndex);
  assert.match(html, /id="themeModeControl"/);
  assert.match(html, /data-theme-mode="light"[^>]*>浅色<\/button>/);
  assert.match(html, /data-theme-mode="dark"[^>]*>深色<\/button>/);
  assert.match(html, /data-theme-mode="system"[^>]*>系统<\/button>/);
  assert.doesNotMatch(html, /id="themeModeSelect"/);
  assert.doesNotMatch(html, /跟随系统时/);
  assert.match(script, /import \{ initializeTheme \} from '\.\/theme\.js';/);
  assert.match(script, /initializeTheme\(elements\.themeModeControl\)/);
  assert.doesNotMatch(script, /setServiceError/);
  assert.match(themeScript, /ai-cockpit-theme-mode/);
  assert.match(themeScript, /return THEME_MODES\.has\(stored\) \? stored : 'light'/);
  assert.match(themeScript, /localStorage/);
  assert.match(themeScript, /matchMedia\('\(prefers-color-scheme: dark\)'\)/);
  assert.match(themeScript, /addEventListener\('change'/);
  assert.match(styles, /:root\[data-theme="dark"\]/);
  assert.match(styles, /--window:\s*#24252a;/);
  assert.match(styles, /--sidebar:\s*#292a30;/);
  assert.match(styles, /--panel:\s*#303137;/);
  assert.match(styles, /@media \(prefers-color-scheme: dark\)/);
  assert.match(styles, /color-scheme: dark/);
  assert.match(styles, /\.theme-segmented/);
  assert.match(styles, /\.theme-segment\.active/);
  assert.match(styles, /:root\[data-theme="dark"\] \.switch input:checked \+ span\s*{[^}]*background:\s*#34c759;/s);
});

test('service control distinguishes primary start from secondary stop actions', () => {
  const script = readDesktopFile('src/app.js');
  const styles = readDesktopStyles();

  assert.match(script, /classList\.toggle\('stop-action', running \|\| transition === 'stopping'\)/);
  assert.match(styles, /\.primary-service-button\.stop-action\s*{[^}]*background:\s*#fff;/s);
  assert.match(styles, /\.primary-service-button\.stop-action:hover\s*{[^}]*color:\s*var\(--red\);[^}]*background:\s*var\(--red-soft\);/s);
  assert.match(styles, /\.primary-service-button\.stop-action\.loading\s*{[^}]*color:\s*var\(--red\);/s);
  assert.match(styles, /:root\[data-theme="dark"\] \.primary-service-button\.stop-action\s*{/);
});

test('about section exposes version and non-modal GitHub update checks', () => {
  const html = readDesktopFile('index.html');
  const script = readDesktopFile('src/app.js');
  const updateScript = readDesktopFile('src/update.js');
  const aboutIndex = html.indexOf('aria-label="关于"');
  const preferencesIndex = html.indexOf('aria-label="使用偏好"');

  assert.ok(aboutIndex > preferencesIndex);
  assert.match(html, /id="currentVersionText"/);
  assert.match(html, /id="checkUpdateButton"/);
  assert.match(html, /id="settingsUpdateBadge"/);
  assert.match(script, /invoke\('get_app_version'\)/);
  assert.match(script, /checkForUpdates\(\{ automatic: true \}\)/);
  assert.match(script, /invoke\('open_release_page'/);
  assert.doesNotMatch(html, /更新弹窗|立即安装|自动下载/);
  assert.doesNotMatch(script, /openUpdateModal|requestConfirmation\([^)]*更新/s);
  assert.match(updateScript, /https:\/\/api\.github\.com\/repos\/iiiiuuuuuu\/ai-cockpit\/releases\/latest/);
  assert.match(updateScript, /24 \* 60 \* 60 \* 1000/);
});

test('update module compares semantic versions and validates project releases', async () => {
  const updateUrl = pathToFileURL(path.join(desktopDir, 'src', 'update.js')).href;
  const { fetchLatestRelease, isNewerVersion, parseGithubRelease } = await import(updateUrl);

  assert.equal(isNewerVersion('0.3.0', '0.2.0'), true);
  assert.equal(isNewerVersion('0.2.0', '0.2.0'), false);
  assert.equal(isNewerVersion('0.1.9', '0.2.0'), false);
  assert.equal(isNewerVersion('1.0.0', '0.9.9'), true);
  assert.deepEqual(parseGithubRelease({
    tag_name: 'v0.3.0',
    html_url: 'https://github.com/iiiiuuuuuu/ai-cockpit/releases/tag/v0.3.0',
  }, '0.2.0'), {
    currentVersion: '0.2.0',
    latestVersion: '0.3.0',
    releaseUrl: 'https://github.com/iiiiuuuuuu/ai-cockpit/releases/tag/v0.3.0',
    updateAvailable: true,
  });
  assert.throws(() => parseGithubRelease({
    tag_name: 'v0.3.0',
    html_url: 'https://example.com/download',
  }, '0.2.0'), /无效/);
  assert.deepEqual(await fetchLatestRelease('0.2.0', async () => ({
    ok: false,
    status: 404,
  })), {
    currentVersion: '0.2.0',
    latestVersion: '0.2.0',
    releaseUrl: 'https://github.com/iiiiuuuuuu/ai-cockpit/releases/latest',
    updateAvailable: false,
    releasePublished: false,
  });
});

test('desktop shell keeps startup manual and removes redundant sidebar copy', () => {
  const html = readDesktopFile('index.html');
  const rustSource = readDesktopRust();
  const tauriConfig = readDesktopFile('src-tauri/tauri.conf.json');

  assert.doesNotMatch(html, /Local router/);
  assert.doesNotMatch(html, /id="settingsServicePortInput" type="number"/);
  assert.doesNotMatch(html, /id="settingsProxyPortInput" type="number"/);
  assert.match(html, /id="settingsServicePortInput" type="text"/);
  assert.match(html, /id="settingsProxyPortInput" type="text"/);
  assert.match(html, /class="brand-glyph"/);

  assert.match(tauriConfig, /"title": "AI Cockpit"/);
  assert.match(rustSource, /emit_startup_status/);
  assert.doesNotMatch(rustSource, /fn maybe_start_or_emit_status[\s\S]*?run_service_command\(app, "start"\)\?/);
});

test('desktop icon uses the approved minimal switch brand mark', () => {
  const html = readDesktopFile('index.html');
  const iconSvg = readDesktopFile('src-tauri/icons/icon.svg');

  assert.match(html, /data-brand-icon="minimal-switch"/);
  assert.match(html, /class="brand-glyph"[^>]*viewBox="0 0 72 72"/);
  assert.match(html, /brand-glyph-selected-node/);
  assert.match(iconSvg, /id="minimal-switch-brand-icon"/);
  assert.match(iconSvg, /data-icon-concept="minimal-switch"/);
  assert.match(iconSvg, /id="selected-node"/);
  assert.match(iconSvg, /#168bff/);

  assert.doesNotMatch(html, /<circle cx="16" cy="16" r="10\.5"/);
  assert.doesNotMatch(iconSvg, /id="dial"/);
});

test('desktop frontend wires new snapshot account settings and service interactions', () => {
  const script = readDesktopScripts();

  assert.match(script, /get_desktop_snapshot/);
  assert.match(script, /save_desktop_settings/);
  assert.match(script, /save_desktop_account/);
  assert.match(script, /delete_desktop_account/);
  assert.match(script, /activate_desktop_account/);
  assert.match(script, /refresh_desktop_account/);
  assert.doesNotMatch(script, /refresh_desktop_accounts/);
  assert.match(script, /toggle_desktop_account_auto_switch/);
  assert.match(script, /restore_desktop_account/);
  assert.match(script, /mark_desktop_account_deleted/);
  assert.match(script, /save_access_token/);
  assert.match(script, /delete_access_token/);
  assert.match(script, /start_service/);
  assert.match(script, /stop_service/);
  assert.match(script, /serviceTransition/);
  assert.match(script, /SERVICE_TRANSITION_MIN_MS = 1500/);
  assert.match(script, /setServiceTransition/);
  assert.match(script, /waitForServiceTransitionPaint/);
  assert.match(script, /waitForMinimumServiceTransition/);
  assert.match(script, /aria-busy/);
  assert.match(script, /启动中/);
  assert.match(script, /停止中/);
  assert.doesNotMatch(script, /async function toggleService\(\) \{\s*setBusy\(true\);/);
  assert.match(script, /generateAccessToken/);
  assert.match(script, /filterAccounts/);
  assert.match(script, /getAccountFilterCounts/);
  assert.doesNotMatch(script, /showDeletedAccounts/);
  assert.doesNotMatch(script, /toggleDeletedAccountsButton/);
  assert.doesNotMatch(script, /renderDeletedToggle/);
  assert.match(script, /renderEyeIcon/);
  assert.match(script, /accountModalSubtitle\.hidden = true/);
  assert.doesNotMatch(script, /refreshLiveQuotas/);
  assert.match(script, /data-card-action="activate"/);
  assert.match(script, /data-card-action="refresh"/);
  assert.match(script, /data-card-action="toggle-auto-switch"/);
  assert.match(script, /data-card-action="restore"/);
  assert.match(script, /sortAccounts/);
  assert.match(script, /parseTokenJson/);
  assert.match(script, /setCardActionLoading/);
  assert.match(script, /requestConfirmation/);
  assert.match(script, /toggleSecretInput/);
  assert.match(script, /button\.innerHTML = renderEyeIcon/);
  assert.match(script, /showToast/);
  assert.match(script, /buildSettingsSaveMessage/);
  assert.match(script, /设置已保存/);
  assert.match(script, /服务端口已切换到/);
  assert.match(script, /代理端口已同步为/);
  assert.match(script, /设置保存失败/);
  assert.doesNotMatch(script, /启动服务后生效/);
  assert.doesNotMatch(script, /已同步到运行中的服务/);
  assert.match(script, /resolveTokenTitleParts/);
  assert.match(script, /setDateTimeInput/);
  assert.match(script, /readDateTimeInput/);
  assert.match(script, /formatSelectionReason/);
  assert.match(script, /当前使用：/);
  assert.doesNotMatch(script, /window\.confirm/);
  assert.match(script, /formatRuntimeErrorText/);
  assert.match(script, /stripDiagnosticIds/);
  assert.match(script, /检查请求超时，请稍后重试/);
  assert.match(script, /网络连接失败，请检查代理或上游连通性/);
  assert.doesNotMatch(script, /accessTokenValueInput/);
  assert.match(script, /class="token-secret" title="\$\{escapeHtml\(token\.token \|\| ''\)\}"/);
  assert.doesNotMatch(script, /runtime\.last_error\) return String\(runtime\.last_error\)/);
  assert.match(script, /window\.setInterval\(\(\) => loadSnapshot\(\{ silent: true \}\), 30000\);/);
  assert.doesNotMatch(script, /window\.setInterval\(\(\) => refreshLiveQuotas\(\{ silent: true \}\), 60000\);/);

  assert.doesNotMatch(script, /show_config_page/);
  assert.doesNotMatch(script, /open_admin_in_browser/);
  assert.doesNotMatch(script, /read_recent_logs/);
});

test('desktop account cards keep runtime details compact', () => {
  const css = readDesktopStyles();

  assert.match(css, /\.foot-text div\s*{[^}]*text-overflow: ellipsis;/s);
  assert.match(css, /\.foot-text div\s*{[^}]*white-space: nowrap;/s);
  assert.match(css, /\.icon\.loading::before/);
  assert.match(css, /@keyframes spin/);
  assert.match(css, /\.reason-line\.error/);
  assert.match(css, /\.account-card\.current:not\(\.unavailable\)/);
  assert.match(css, /\.account-card\.current::before/);
  assert.match(css, /\.account-card\.unavailable/);
  assert.match(css, /\.account-card\.current\.unavailable/);
  assert.match(css, /\.account-head\s*{[^}]*min-width:\s*0;/s);
  assert.match(css, /\.account-title\s*{[^}]*flex:\s*1 1 auto;/s);
  assert.match(css, /\.type-pill\s*{[^}]*flex:\s*0 0 auto;/s);
  assert.match(css, /\.account-card > \*\s*{[^}]*min-width:\s*0;/s);
  assert.match(css, /\.card-foot\s*{[^}]*min-width:\s*0;/s);
  assert.match(css, /\.foot-text\s*{[^}]*flex:\s*1 1 auto;/s);
  assert.match(css, /\.icons\s*{[^}]*flex:\s*0 0 auto;/s);
  assert.match(css, /\.quota-box\s*{[^}]*min-width:\s*0;/s);
  assert.match(css, /\.quota-line\s*{[^}]*min-width:\s*0;/s);
  assert.match(css, /\.quota-meta\s*{[^}]*min-width:\s*0;/s);
  assert.match(css, /\.quota-meta span\s*{[^}]*text-overflow:\s*ellipsis;/s);
  assert.match(css, /\.track\s*{[^}]*min-width:\s*0;/s);
  assert.match(css, /\.reset\s*{[^}]*text-overflow:\s*ellipsis;/s);
  assert.match(css, /\.settings-stack/);
  assert.match(css, /\.settings-section-title/);
  assert.match(css, /\.datetime-input/);
  assert.match(css, /\.secret-input/);
  assert.match(css, /\.toast/);
  assert.match(css, /\.primary-service-button\.loading/);
  assert.match(css, /\.service-spinner/);
  assert.match(css, /\.add-account-button\s*{[^}]*min-width:\s*72px;/s);
  assert.match(css, /\.add-account-button\s*{[^}]*white-space:\s*nowrap;/s);
  assert.doesNotMatch(css, /\.account-card\.attention\s*{[^}]*background:\s*#fffafa;/s);
});

test('settings controls use compact mac-style affordances', () => {
  const html = readDesktopFile('index.html');
  const css = readDesktopStyles();
  const script = readDesktopScripts();

  assert.match(html, /class="small-button token-add-button" type="button" id="openTokenModalButton"/);
  assert.match(html, /class="confirm-body"/);
  assert.doesNotMatch(html, /id="settingsServicePortFeedback"/);
  assert.doesNotMatch(html, /id="accessTokenNameInput"/);
  assert.doesNotMatch(html, /aria-label="AI Cockpit 服务说明"/);
  assert.doesNotMatch(html, /aria-label="服务端口说明"/);
  assert.doesNotMatch(html, /aria-label="代理端口说明"/);
  assert.doesNotMatch(html, /data-tooltip="启动后，本机客户端可通过服务端口访问 AI Cockpit；停止后，本机转发入口不可用。"/);
  assert.doesNotMatch(html, /data-tooltip="客户端连接 AI Cockpit 使用的本机端口，默认 3009。"/);
  assert.doesNotMatch(html, /data-tooltip="可选。填写后，上游请求会通过本机代理端口转发；留空则直连。"/);
  assert.match(html, /data-tooltip="用于保护 AI Cockpit 本地入口。添加时会自动生成令牌，客户端请求需携带。"/);
  assert.match(html, /data-tooltip="开启后，当前账号不可用时会按使用偏好切换到可用账号。"/);
  assert.doesNotMatch(html, /5 小时配额 < 3%/);

  assert.match(css, /\.port-input\s*{[^}]*width:\s*76px;/s);
  assert.match(css, /\.setting-description\s*{[^}]*font-size:\s*11px;[^}]*color:\s*var\(--soft\);/s);
  assert.doesNotMatch(css, /\.setting-error\s*{/);
  assert.match(css, /\.port-input\s*{[^}]*justify-self:\s*center;[^}]*text-align:\s*center;/s);
  assert.match(css, /\.token-row\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*52px\s*52px;/s);
  assert.match(css, /\.mini-button\s*{[^}]*min-height:\s*28px;/s);
  assert.match(css, /\.token-add-button\s*{[^}]*min-width:\s*56px;/s);
  assert.match(css, /\.info-dot\s*{[^}]*width:\s*12px;[^}]*height:\s*12px;[^}]*background:\s*transparent;/s);
  assert.match(css, /\.info-dot:hover,\s*\.info-dot:focus-visible\s*{[^}]*background:\s*rgba\(0,\s*102,\s*204,\s*0\.06\);/s);
  assert.match(css, /\.info-dot::after\s*{[^}]*background:\s*rgba\(29,\s*29,\s*31,\s*0\.94\);[^}]*text-align:\s*left;/s);
  assert.match(css, /\.toast\s*{[^}]*top:\s*50%;[^}]*bottom:\s*auto;[^}]*transform:\s*translate\(-50%,\s*-50%\);/s);
  assert.match(css, /\.confirm-modal\s*{[^}]*width:\s*min\(460px,\s*calc\(100vw - 32px\)\);/s);
  assert.match(css, /\.confirm-body\s*{[^}]*padding:\s*18px 22px 20px;/s);
  assert.match(css, /\.dialog-button\s*{[^}]*height:\s*38px;[^}]*box-shadow:\s*none;/s);
  assert.match(css, /\.dialog-button-secondary\s*{[^}]*background:\s*#fff;/s);
  assert.match(css, /\.dialog-button-danger-outline\s*{[^}]*color:\s*var\(--red\);[^}]*background:\s*#fff;/s);
  assert.match(css, /\.dialog-button-primary\s*{[^}]*background:\s*var\(--accent\);/s);
  assert.match(css, /\.dialog-button-danger\s*{[^}]*background:\s*var\(--red\);/s);
  assert.doesNotMatch(css, /\.modal-footer\s*{[^}]*box-shadow:/s);
  assert.match(css, /\.confirm-body p\s*{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(css, /\.confirm-subject\s*{[^}]*display:\s*block;[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere;[^}]*word-break:\s*break-word;/s);

  assert.match(html, /id="confirmModalDialog"[^>]*tabindex="-1"/);
  assert.match(html, /class="dialog-button dialog-button-secondary" type="button" id="confirmModalCancelButton">取消/);
  assert.match(html, /class="dialog-button dialog-button-danger-outline" type="button" id="confirmModalSecondaryButton">彻底删除/);
  assert.match(html, /class="dialog-button dialog-button-primary" type="button" id="confirmModalPrimaryButton">确认/);
  assert.match(script, /primaryText: deleted \? '彻底删除' : '删除'/);
  assert.match(script, /secondaryText: deleted \? '' : '彻底删除'/);
  assert.doesNotMatch(script, /primaryText: deleted \? '彻底删除' : '标记删除'/);
  assert.doesNotMatch(script, /secondaryText: deleted \? '' : '直接彻底删除'/);
  assert.match(script, /classList\.toggle\('dialog-button-danger', Boolean\(options\.danger\)\)/);
  assert.match(script, /setConfirmationMessage\(options\)/);
  assert.match(script, /elements\.confirmModalDialog\?\.focus\(\)/);
  assert.doesNotMatch(script, /settingsServicePortFeedback/);
  assert.doesNotMatch(script, /state\.serviceError/);
  assert.doesNotMatch(script, /if \(caughtError\) \{\s*window\.alert\(caughtError\.message/s);
  assert.match(script, /function readPortInput\(input, \{ optional = false, label = '端口' \} = \{\}\)/);
  assert.match(script, /if \(!raw\) \{\s*if \(optional\) return null;\s*throw new Error\(`\$\{label\}不能为空`\);/s);
  assert.match(script, /readPortInput\(elements\.settingsServicePortInput, \{ label: '服务端口' \}\)/);
  assert.match(script, /readPortInput\(elements\.settingsProxyPortInput, \{ optional: true, label: '代理端口' \}\)/);
  assert.doesNotMatch(script, /readPortInput\(elements\.settingsServicePortInput, 3009\)/);
  assert.match(script, /if \(caughtError\) \{[\s\S]*showToast\(caughtError\.message \|\| String\(caughtError\)\);[\s\S]*\}/);

  assert.doesNotMatch(html, /data-tooltip="决定自动选择账号时优先走 Token 还是 API Key。"/);
  assert.doesNotMatch(html, /aria-label="优先使用说明"/);
  assert.doesNotMatch(html, />i<\/button>/);
  assert.match(html, />\?<\/button>/);
});

test('desktop user-facing product name is AI Cockpit', () => {
  const html = readDesktopFile('index.html');
  const script = readDesktopScripts();
  const tauriConfig = readDesktopFile('src-tauri/tauri.conf.json');
  const rustSource = readDesktopRust();

  assert.match(html, /AI Cockpit/);
  assert.match(script, /AI Cockpit/);
  assert.match(tauriConfig, /"productName": "AI Cockpit"/);
  assert.match(rustSource, /AI Cockpit/);
  assert.match(rustSource, /activate_desktop_account/);
  assert.match(rustSource, /refresh_desktop_account/);
  assert.doesNotMatch(rustSource, /fn refresh_desktop_accounts/);
  assert.match(rustSource, /mark_desktop_account_deleted/);
  assert.match(rustSource, /spawn_blocking/);

  assert.doesNotMatch(html, /Airouter/);
  assert.doesNotMatch(script, /Airouter/);
  assert.doesNotMatch(tauriConfig, /Airouter/);
});
