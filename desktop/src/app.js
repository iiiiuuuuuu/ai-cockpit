import { waitForMinimumServiceTransition, waitForServiceTransitionPaint } from './actions.js';
import {
  text,
  normalizeAccount,
  isApiKeyAccount,
  isDeletedAccount,
  getDisplayName,
  resolveTokenTitleParts,
  resolveAccountTitleParts,
  getSearchText,
  getSortOrder,
  getRuntimeValue,
  getPrimaryQuota,
  getWeeklyQuota,
  filterAccounts,
  getAccountFilterCounts,
  sortAccounts,
  quotaSortValue,
  formatPercent,
  clampPercent,
  quotaTone,
  formatPrice,
  parseDateTime,
  formatDateTimeLocalValue,
  setDateTimeInput,
  readDateTimeInput,
  formatUsageDays,
  formatLastChecked,
  formatDuration,
  formatResetText,
  stripDiagnosticIds,
  formatRuntimeErrorText,
  formatReasonText,
  formatSelectionReason,
  getRuntimeError,
  getHealthText,
  getUnavailableReasonText,
  formatReason,
  getAvailability,
  maskSecret,
} from './account-model.js';
import { escapeHtml, renderEyeIcon } from './render.js';
import { createUiState, normalizeSnapshot } from './state.js';
import { createCommandInvoker } from './tauri-api.js';
import { initializeTheme } from './theme.js';
import { fetchLatestRelease, readCachedUpdate, writeCachedUpdate } from './update.js';

  const PRODUCT_NAME = 'AI Cockpit';
  const routingPreferenceMeta = {
    token_first: 'Token 优先',
    apikey_first: 'API Key 优先',
    token_only: '仅 Token',
    apikey_only: '仅 API Key',
  };
  const SERVICE_TRANSITION_MIN_MS = 1500;

  const elements = {
    pages: [...document.querySelectorAll('.page')],
    navButtons: [...document.querySelectorAll('[data-page]')],
    serviceStatusLabel: document.querySelector('#serviceStatusLabel'),
    serviceStatusText: document.querySelector('#serviceStatusText'),
    settingsUpdateBadge: document.querySelector('#settingsUpdateBadge'),
    accountSearchInput: document.querySelector('#accountSearchInput'),
    filterButtons: [...document.querySelectorAll('[data-filter-type]')],
    filterCountElements: [...document.querySelectorAll('[data-filter-count]')],
    deletedAccountsFilterButton: document.querySelector('[data-filter-type="deleted"]'),
    accountSortSelect: document.querySelector('#accountSortSelect'),
    sortDirectionButton: document.querySelector('#sortDirectionButton'),
    routingSummary: document.querySelector('#routingSummary'),
    accountsGrid: document.querySelector('#accountsGrid'),
    emptyAccountsState: document.querySelector('#emptyAccountsState'),
    openAddAccountModalButton: document.querySelector('#openAddAccountModalButton'),
    emptyAddAccountButton: document.querySelector('#emptyAddAccountButton'),
    openSettingsButton: document.querySelector('#openSettingsButton'),
    accountModal: document.querySelector('#accountModal'),
    accountForm: document.querySelector('#accountForm'),
    accountModalTitle: document.querySelector('#accountModalTitle'),
    accountModalSubtitle: document.querySelector('#accountModalSubtitle'),
    accountModeTabs: document.querySelector('#accountModeTabs'),
    accountModeButtons: [...document.querySelectorAll('[data-account-mode]')],
    saveAccountButton: document.querySelector('#saveAccountButton'),
    tokenAccountPanel: document.querySelector('#tokenAccountPanel'),
    apiKeyAccountPanel: document.querySelector('#apiKeyAccountPanel'),
    tokenEmailInput: document.querySelector('#tokenEmailInput'),
    tokenAliasInput: document.querySelector('#tokenAliasInput'),
    tokenPriceInput: document.querySelector('#tokenPriceInput'),
    tokenStartedAtInput: document.querySelector('#tokenStartedAtInput'),
    tokenStoppedAtInput: document.querySelector('#tokenStoppedAtInput'),
    tokenAccountIdInput: document.querySelector('#tokenAccountIdInput'),
    tokenClientIdInput: document.querySelector('#tokenClientIdInput'),
    tokenAccessTokenInput: document.querySelector('#tokenAccessTokenInput'),
    tokenRefreshTokenInput: document.querySelector('#tokenRefreshTokenInput'),
    tokenJsonInput: document.querySelector('#tokenJsonInput'),
    parseTokenJsonButton: document.querySelector('#parseTokenJsonButton'),
    tokenJsonFeedback: document.querySelector('#tokenJsonFeedback'),
    tokenParseStatus: document.querySelector('#tokenParseStatus'),
    apiKeyBaseUrlInput: document.querySelector('#apiKeyBaseUrlInput'),
    apiKeySecretInput: document.querySelector('#apiKeySecretInput'),
    apiKeyDescriptionInput: document.querySelector('#apiKeyDescriptionInput'),
    apiKeyPriceInput: document.querySelector('#apiKeyPriceInput'),
    apiKeyStartedAtInput: document.querySelector('#apiKeyStartedAtInput'),
    apiKeyStoppedAtInput: document.querySelector('#apiKeyStoppedAtInput'),
    serviceToggleButton: document.querySelector('#serviceToggleButton'),
    settingsServicePortInput: document.querySelector('#settingsServicePortInput'),
    settingsProxyPortInput: document.querySelector('#settingsProxyPortInput'),
    themeModeControl: document.querySelector('#themeModeControl'),
    openTokenModalButton: document.querySelector('#openTokenModalButton'),
    accessTokensList: document.querySelector('#accessTokensList'),
    routingPreferenceSelect: document.querySelector('#routingPreferenceSelect'),
    autoSwitchInput: document.querySelector('#autoSwitchInput'),
    currentVersionText: document.querySelector('#currentVersionText'),
    checkUpdateButton: document.querySelector('#checkUpdateButton'),
    tokenModal: document.querySelector('#tokenModal'),
    tokenForm: document.querySelector('#tokenForm'),
    confirmModal: document.querySelector('#confirmModal'),
    confirmModalDialog: document.querySelector('#confirmModalDialog'),
    confirmModalTitle: document.querySelector('#confirmModalTitle'),
    confirmModalMessage: document.querySelector('#confirmModalMessage'),
    confirmModalPrimaryButton: document.querySelector('#confirmModalPrimaryButton'),
    confirmModalSecondaryButton: document.querySelector('#confirmModalSecondaryButton'),
    confirmModalCancelButton: document.querySelector('#confirmModalCancelButton'),
    confirmModalCloseButton: document.querySelector('#confirmModalCloseButton'),
    toast: document.querySelector('#toast'),
  };

  const state = createUiState();
  const invoke = createCommandInvoker({ state, normalizeAccount, maskSecret });

  function renderQuota(label, value, resetText) {
    const tone = quotaTone(value);
    const toneClass = tone ? ` ${tone}` : '';
    const valueText = formatPercent(value);
    return `
      <div class="quota-line">
        <div class="quota-meta">
          <span>${escapeHtml(label)}</span>
          <b class="${tone ? `quota-${tone}` : ''}">${escapeHtml(valueText)}</b>
        </div>
        <div class="track" aria-hidden="true">
          <div class="fill${toneClass}" style="width: ${clampPercent(value)}%"></div>
        </div>
        <div class="reset">${escapeHtml(resetText)}</div>
      </div>
    `;
  }

  function renderAccountCard(account) {
    const normalized = normalizeAccount(account);
    const item = normalized.item || {};
    const apiKey = isApiKeyAccount(normalized);
    const deleted = Boolean(isDeletedAccount(normalized));
    const available = getAvailability(normalized);
    const usage = formatUsageDays(normalized);
    const price = formatPrice(normalized);
    const typeClass = apiKey ? 'apikey' : 'token';
    const typeLabel = apiKey ? 'API KEY' : 'TOKEN';
    const titleParts = resolveAccountTitleParts(normalized);
    const subtitle = titleParts.subtitle;
    const availabilityText = available ? '可用' : '不可用';
    const cardClass = [
      'account-card',
      normalized.is_active ? 'current' : '',
      deleted ? 'deleted' : '',
      available ? '' : 'unavailable',
    ].filter(Boolean).join(' ');
    const statusChips = [
      normalized.is_active ? '<span class="badge blue">当前使用</span>' : '',
      deleted ? '<span class="badge red">已删除</span>' : '',
      usage ? `<span class="badge ${apiKey ? 'blue' : 'green'}">${escapeHtml(usage)}</span>` : '',
      `<span class="badge ${available ? 'green' : 'red'}">${escapeHtml(availabilityText)}</span>`,
      item.auto_switch_disabled && !deleted ? '<span class="badge orange">不自动切入</span>' : '',
      price ? `<span class="badge orange">${escapeHtml(price)}</span>` : '',
    ].filter(Boolean).join('');
    const body = apiKey
      ? `<div class="hint">不做额度检查；刷新会检测 API Key 上游是否可用。<br />状态：${escapeHtml(formatReason(normalized))}</div>`
      : `<div class="quota-box">
          ${renderQuota('5 小时配额', getPrimaryQuota(normalized), formatResetText(normalized, 'primary'))}
          ${renderQuota('周配额', getWeeklyQuota(normalized), formatResetText(normalized, 'secondary'))}
        </div>`;
    const selectionReason = normalized.is_active ? formatSelectionReason(getRuntimeValue(normalized, 'last_selection_reason')) : '';
    const detailText = deleted
      ? `删除标记：${item.deleted_at || '已设置'}`
      : available
        ? selectionReason
          ? `当前使用：${selectionReason}`
          : `状态：${getHealthText(normalized)}`
        : `不可用原因：${getUnavailableReasonText(normalized)}`;
    const autoSwitchDisabled = Boolean(item.auto_switch_disabled);
    const indexText = escapeHtml(String(normalized.index));
    const cardActions = deleted
      ? `
            <button class="icon" type="button" data-card-action="restore" data-index="${indexText}" title="恢复" aria-label="恢复">↺</button>
            <button class="icon danger" type="button" data-card-action="delete" data-index="${indexText}" title="彻底删除" aria-label="彻底删除">⌫</button>
        `
      : `
            <button class="icon" type="button" data-card-action="activate" data-index="${indexText}" ${normalized.is_active ? 'disabled' : ''} title="${normalized.is_active ? '当前使用' : '切换到此账号'}" aria-label="${normalized.is_active ? '当前使用' : '切换到此账号'}">▶</button>
            <button class="icon" type="button" data-card-action="refresh" data-index="${indexText}" title="${apiKey ? '测试此 API Key 上游是否可用' : '刷新此账号额度'}" aria-label="${apiKey ? '测试此 API Key 上游是否可用' : '刷新此账号额度'}">↻</button>
            <button class="icon ${autoSwitchDisabled ? 'auto-disabled' : ''}" type="button" data-card-action="toggle-auto-switch" data-index="${indexText}" data-auto-switch-disabled="${autoSwitchDisabled ? 'true' : 'false'}" title="${autoSwitchDisabled ? '允许自动切换到此账号' : '禁止自动切换到此账号'}" aria-label="${autoSwitchDisabled ? '允许自动切换到此账号' : '禁止自动切换到此账号'}">${autoSwitchDisabled ? '+' : '⊘'}</button>
            <button class="icon" type="button" data-card-action="edit" data-index="${indexText}" title="编辑" aria-label="编辑">✎</button>
            <button class="icon danger" type="button" data-card-action="delete" data-index="${indexText}" title="删除" aria-label="删除">⌫</button>
        `;

    return `
      <article class="${cardClass}" data-account-index="${escapeHtml(String(normalized.index))}">
        <div class="account-head">
          <div class="account-title">
            <strong title="${escapeHtml(titleParts.title)}">${escapeHtml(titleParts.title)}</strong>
            ${subtitle ? `<span title="${escapeHtml(subtitle)}">${escapeHtml(subtitle)}</span>` : ''}
          </div>
          <span class="type-pill ${typeClass}">${escapeHtml(typeLabel)}</span>
        </div>
        <div class="badges">${statusChips}</div>
        ${body}
        <div class="card-foot">
          <div class="foot-text">
            <div>最后检查：${escapeHtml(formatLastChecked(normalized))}</div>
            <div class="reason-line${available && !deleted ? '' : ' error'}" title="${escapeHtml(detailText)}">${escapeHtml(detailText)}</div>
          </div>
          <div class="icons">
            ${cardActions}
          </div>
        </div>
      </article>
    `;
  }

  function renderAccounts() {
    const sourceAccounts = Array.isArray(state.snapshot.accounts) ? state.snapshot.accounts : [];
    const searchQuery = elements.accountSearchInput.value;
    const counts = getAccountFilterCounts(sourceAccounts, searchQuery);
    const totalDeleted = getAccountFilterCounts(sourceAccounts, '').deleted;

    if (elements.deletedAccountsFilterButton) {
      elements.deletedAccountsFilterButton.hidden = totalDeleted === 0;
    }
    if (totalDeleted === 0 && state.filterType === 'deleted') {
      state.filterType = 'all';
    }
    elements.filterCountElements.forEach(element => {
      element.textContent = String(counts[element.dataset.filterCount] || 0);
    });
    elements.filterButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.filterType === state.filterType);
    });

    const accounts = sortAccounts(filterAccounts(
      sourceAccounts,
      state,
      searchQuery,
    ), state);
    elements.accountsGrid.innerHTML = accounts.map(renderAccountCard).join('');
    const hasAccounts = accounts.length > 0;
    elements.accountsGrid.hidden = !hasAccounts;
    elements.emptyAccountsState.hidden = hasAccounts;
  }

  function renderService() {
    const service = state.snapshot.service || {};
    const running = Boolean(service.running);
    const transition = state.serviceTransition;
    const stateName = transition || (running ? 'running' : 'stopped');
    const statusText = transition === 'starting'
      ? '启动中'
      : transition === 'stopping'
        ? '停止中'
        : running ? '运行中' : '未开启';
    const buttonText = transition === 'starting'
      ? '启动中'
      : transition === 'stopping'
        ? '停止中'
        : running ? '停止服务' : '启动服务';
    elements.serviceStatusLabel.dataset.state = stateName;
    elements.serviceStatusText.textContent = statusText;
    elements.serviceToggleButton.classList.toggle('stop-action', running || transition === 'stopping');
    elements.serviceToggleButton.classList.toggle('loading', Boolean(transition));
    elements.serviceToggleButton.disabled = Boolean(transition);
    elements.serviceToggleButton.setAttribute('aria-busy', transition ? 'true' : 'false');
    elements.serviceToggleButton.innerHTML = transition
      ? `<span class="service-spinner" aria-hidden="true"></span><span>${buttonText}</span>`
      : buttonText;
  }

  function setServiceTransition(transition) {
    state.serviceTransition = transition;
    renderService();
  }

  function renderSettings() {
    const settings = state.snapshot.settings || {};
    elements.settingsServicePortInput.value = String(settings.port || state.snapshot.service?.port || 3009);
    elements.settingsProxyPortInput.value = settings.proxyPort ? String(settings.proxyPort) : '';
    elements.routingPreferenceSelect.value = routingPreferenceMeta[settings.routingPreference] ? settings.routingPreference : 'token_first';
    elements.autoSwitchInput.checked = settings.autoSwitch !== false;
  }

  function renderUpdate() {
    const info = state.update.info;
    const updateAvailable = Boolean(info?.updateAvailable);
    elements.currentVersionText.textContent = state.appVersion
      ? `当前版本 v${state.appVersion}`
      : '当前版本';
    elements.settingsUpdateBadge.hidden = !updateAvailable;
    elements.checkUpdateButton.disabled = state.update.checking;
    elements.checkUpdateButton.classList.toggle('loading', state.update.checking);
    elements.checkUpdateButton.classList.toggle('update-available', updateAvailable);
    elements.checkUpdateButton.innerHTML = state.update.checking
      ? '<span class="update-spinner" aria-hidden="true"></span><span>检查中</span>'
      : updateAvailable
        ? `<span class="update-dot" aria-hidden="true"></span><span>下载 v${escapeHtml(info.latestVersion)}</span>`
        : '检查更新';
  }

  async function loadAppVersion() {
    try {
      state.appVersion = String(await invoke('get_app_version'));
    } catch {
      state.appVersion = '';
    }
    renderUpdate();
  }

  async function checkForUpdates({ automatic = false } = {}) {
    if (state.update.checking || !state.appVersion) return;
    if (automatic) {
      const cached = readCachedUpdate(state.appVersion);
      if (cached) {
        state.update.info = cached;
        renderUpdate();
        return;
      }
    }

    state.update.checking = true;
    renderUpdate();
    try {
      const info = await fetchLatestRelease(state.appVersion);
      state.update.info = info;
      writeCachedUpdate(info);
      if (!automatic && !info.updateAvailable) {
        showToast(info.releasePublished === false ? '当前暂无可下载的新版本' : '当前已是最新版本');
      }
    } catch (error) {
      if (!automatic) showToast(error.message || String(error));
    } finally {
      state.update.checking = false;
      renderUpdate();
    }
  }

  async function handleUpdateButton() {
    const info = state.update.info;
    if (!info?.updateAvailable) {
      await checkForUpdates();
      return;
    }
    try {
      await invoke('open_release_page', { url: info.releaseUrl });
    } catch (error) {
      showToast(error.message || String(error));
    }
  }

  function renderRoutingSummary() {
    const settings = state.snapshot.settings || {};
    const preference = routingPreferenceMeta[settings.routingPreference] || routingPreferenceMeta.token_first;
    const autoSwitchText = settings.autoSwitch === false ? '已关闭' : '已开启';
    const autoSwitchClass = settings.autoSwitch === false ? 'off' : 'on';
    elements.routingSummary.innerHTML = `
      <span class="summary-group"><span>使用偏好：</span><b>${escapeHtml(preference)}</b></span>
      <span class="separator" aria-hidden="true"></span>
      <span class="summary-group"><span>自动切换：</span><span class="${autoSwitchClass}">${escapeHtml(autoSwitchText)}</span></span>
    `;
  }

  function renderAccessTokens() {
    const tokens = Array.isArray(state.snapshot.accessTokens) ? state.snapshot.accessTokens : [];
    if (!tokens.length) {
      elements.accessTokensList.innerHTML = '<div class="token-row"><div class="token-secret">暂无令牌</div></div>';
      return;
    }

    elements.accessTokensList.innerHTML = tokens.map((token, index) => {
      const tokenIndex = Number.isInteger(token.index) ? token.index : index;
      return `
        <div class="token-row">
          <div>
            <div class="token-name">${escapeHtml(text(token.name, `令牌 #${tokenIndex + 1}`))}</div>
            <div class="token-secret" title="${escapeHtml(token.token || '')}">${escapeHtml(token.token || '')}</div>
          </div>
          <button class="mini-button" type="button" data-token-action="copy" data-index="${escapeHtml(String(tokenIndex))}">复制</button>
          <button class="mini-button danger" type="button" data-token-action="delete" data-index="${escapeHtml(String(tokenIndex))}">删除</button>
        </div>
      `;
    }).join('');
  }

  function renderAll() {
    renderService();
    renderSettings();
    renderUpdate();
    renderRoutingSummary();
    renderAccounts();
    renderAccessTokens();
  }

  function setPage(page) {
    state.page = page === 'settings' ? 'settings' : 'accounts';
    elements.pages.forEach(element => element.classList.toggle('active', element.dataset.page === state.page));
    elements.navButtons.forEach(button => {
      if (button.dataset.page) {
        button.classList.toggle('active', button.dataset.page === state.page);
      }
    });
  }

  function setBusy(busy) {
    state.busy = busy;
    [
      elements.serviceToggleButton,
      elements.openAddAccountModalButton,
      elements.openTokenModalButton,
    ].forEach(button => {
      if (button) button.disabled = busy;
    });
  }

  function showAccountMode(mode) {
    state.accountModalMode = mode === 'apikey' ? 'apikey' : 'token';
    elements.accountModeButtons.forEach(button => {
      const active = button.dataset.accountMode === state.accountModalMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    elements.tokenAccountPanel.classList.toggle('active', state.accountModalMode === 'token');
    elements.apiKeyAccountPanel.classList.toggle('active', state.accountModalMode === 'apikey');
    setPanelInputsDisabled(elements.tokenAccountPanel, state.accountModalMode !== 'token');
    setPanelInputsDisabled(elements.apiKeyAccountPanel, state.accountModalMode !== 'apikey');
    elements.accountModeTabs.hidden = false;
    if (elements.saveAccountButton) {
      elements.saveAccountButton.textContent = state.accountModalMode === 'apikey' ? '添加 API Key 账号' : '添加 Token 账号';
    }
  }

  function setPanelInputsDisabled(panel, disabled) {
    panel.querySelectorAll('input, textarea, select, button').forEach(input => {
      input.disabled = disabled;
    });
  }

  function openModal(modal) {
    modal.hidden = false;
    const firstInput = modal.querySelector('input, textarea, select, button');
    window.setTimeout(() => firstInput?.focus(), 0);
  }

  function closeModalById(id) {
    const modal = document.getElementById(id);
    if (modal) modal.hidden = true;
    state.editingAccountIndex = null;
  }

  function clearAccountForm() {
    elements.accountForm.reset();
    elements.tokenJsonFeedback.textContent = '';
    elements.tokenJsonFeedback.className = 'inline-message';
    elements.accountModalSubtitle.hidden = false;
    document.querySelectorAll('[data-secret-toggle]').forEach(button => {
      const input = document.getElementById(button.dataset.secretToggle);
      if (input) input.type = 'password';
      button.innerHTML = renderEyeIcon(false);
      button.classList.remove('active');
      button.setAttribute('title', '显示明文');
      button.setAttribute('aria-label', '显示明文');
    });
    if (elements.tokenParseStatus) {
      elements.tokenParseStatus.textContent = '尚未解析';
    }
  }

  function openAddAccountModal() {
    clearAccountForm();
    const defaultStartedAt = formatDateTimeLocalValue(new Date());
    elements.tokenStartedAtInput.value = defaultStartedAt;
    elements.apiKeyStartedAtInput.value = defaultStartedAt;
    state.editingAccountIndex = null;
    elements.accountModalTitle.textContent = '添加账号';
    elements.accountModalSubtitle.hidden = false;
    elements.accountModalSubtitle.textContent = 'Token 模式用于 Codex 登录态账号；API Key 模式默认按 ChatGPT/OpenAI 兼容上游使用。';
    showAccountMode('token');
    openModal(elements.accountModal);
  }

  function findAccount(index) {
    return (state.snapshot.accounts || []).find(account => normalizeAccount(account).index === index);
  }

  function openEditAccountModal(index) {
    const account = findAccount(index);
    if (!account) return;
    const normalized = normalizeAccount(account);
    const item = normalized.item || {};
    const apiKey = isApiKeyAccount(normalized);
    state.editingAccountIndex = normalized.index;
    clearAccountForm();
    elements.accountModalTitle.textContent = '编辑账号';
    elements.accountModalSubtitle.textContent = '';
    elements.accountModalSubtitle.hidden = true;
    if (elements.saveAccountButton) {
      elements.saveAccountButton.textContent = '保存';
    }
    elements.accountModeTabs.hidden = true;
    state.accountModalMode = apiKey ? 'apikey' : 'token';
    elements.tokenAccountPanel.classList.toggle('active', !apiKey);
    elements.apiKeyAccountPanel.classList.toggle('active', apiKey);
    setPanelInputsDisabled(elements.tokenAccountPanel, apiKey);
    setPanelInputsDisabled(elements.apiKeyAccountPanel, !apiKey);
    if (apiKey) {
      fillApiKeyFields(item);
    } else {
      fillTokenFields(item);
    }
    openModal(elements.accountModal);
  }

  function decodeJwtPayload(token) {
    const segment = String(token || '').split('.')[1];
    if (!segment) return {};
    try {
      const normalized = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
      return JSON.parse(window.atob(normalized));
    } catch (_) {
      return {};
    }
  }

  function parseTokenJson() {
    const raw = elements.tokenJsonInput.value.trim();
    if (!raw) {
      setTokenJsonFeedback('error', '请先粘贴 Token JSON。');
      return null;
    }

    try {
      const parsed = JSON.parse(raw);
      const auth = parsed['https://api.openai.com/auth'] || parsed.auth || {};
      const profile = parsed['https://api.openai.com/profile'] || parsed.profile || {};
      const user = parsed.user || {};
      const account = parsed.account || {};
      const accessToken = parsed.access_token || parsed.accessToken || parsed.token || '';
      const claims = decodeJwtPayload(accessToken);
      const claimAuth = claims['https://api.openai.com/auth'] || {};
      const claimProfile = claims['https://api.openai.com/profile'] || {};
      const fields = {
        description: parsed.description || parsed.email || user.email || profile.email || claimProfile.email || '',
        alias: parsed.alias || '',
        price_yuan: parsed.price_yuan || '',
        started_at: parsed.started_at || parsed.startedAt || elements.tokenStartedAtInput.value,
        stopped_at: parsed.stopped_at || parsed.stoppedAt || '',
        account_id: parsed.account_id || parsed.accountId || account.id || auth.chatgpt_account_id || claimAuth.chatgpt_account_id || '',
        client_id: parsed.client_id || parsed.clientId || claims.client_id || '',
        access_token: accessToken,
        refresh_token: parsed.refresh_token || parsed.refreshToken || '',
      };
      fillTokenFields(fields);
      setTokenJsonFeedback('success', 'JSON 已解析并填充。');
      if (elements.tokenParseStatus) {
        elements.tokenParseStatus.textContent = '已解析';
      }
      return fields;
    } catch (error) {
      setTokenJsonFeedback('error', `JSON 格式不正确：${error.message}`);
      return null;
    }
  }

  function setTokenJsonFeedback(type, message) {
    elements.tokenJsonFeedback.textContent = message || '';
    elements.tokenJsonFeedback.className = `inline-message ${type || ''}`.trim();
  }

  function fillTokenFields(fields) {
    elements.tokenEmailInput.value = fields.description || '';
    elements.tokenAliasInput.value = fields.alias || '';
    elements.tokenPriceInput.value = fields.price_yuan || '';
    setDateTimeInput(elements.tokenStartedAtInput, fields.started_at);
    setDateTimeInput(elements.tokenStoppedAtInput, fields.stopped_at);
    elements.tokenAccountIdInput.value = fields.account_id || '';
    elements.tokenClientIdInput.value = fields.client_id || '';
    elements.tokenAccessTokenInput.value = fields.access_token || '';
    elements.tokenRefreshTokenInput.value = fields.refresh_token || '';
  }

  function fillApiKeyFields(fields) {
    elements.apiKeyBaseUrlInput.value = fields.base_url || '';
    elements.apiKeySecretInput.value = fields.apikey || '';
    elements.apiKeyDescriptionInput.value = fields.alias || fields.description || '';
    elements.apiKeyPriceInput.value = fields.price_yuan || '';
    setDateTimeInput(elements.apiKeyStartedAtInput, fields.started_at);
    setDateTimeInput(elements.apiKeyStoppedAtInput, fields.stopped_at);
  }

  function readOptionalPrice(input) {
    const raw = input.value.trim();
    if (!raw) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
      throw new Error('金额必须是非负数字，最多保留 2 位小数');
    }
    return Number(raw);
  }

  function readPortInput(input, { optional = false, label = '端口' } = {}) {
    const raw = input.value.trim();
    if (!raw) {
      if (optional) return null;
      throw new Error(`${label}不能为空`);
    }
    const port = Number.parseInt(raw, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`${label}必须是 1-65535 之间的数字`);
    }
    return port;
  }

  function readSettingsForm() {
    return {
      port: readPortInput(elements.settingsServicePortInput, { label: '服务端口' }),
      proxyPort: readPortInput(elements.settingsProxyPortInput, { optional: true, label: '代理端口' }),
      routingPreference: elements.routingPreferenceSelect.value,
      autoSwitch: elements.autoSwitchInput.checked,
    };
  }

  function readAccountForm() {
    if (state.accountModalMode === 'apikey') {
      const baseUrl = elements.apiKeyBaseUrlInput.value.trim();
      const apiKey = elements.apiKeySecretInput.value.trim();
      if (!baseUrl) throw new Error('Base URL 必填');
      if (!apiKey) throw new Error('API Key 必填');
      return {
        mode: state.editingAccountIndex !== null ? 'edit' : 'apikey',
        index: state.editingAccountIndex,
        type: 'apikey',
        base_url: baseUrl,
        apikey: apiKey,
        alias: elements.apiKeyDescriptionInput.value.trim(),
        description: elements.apiKeyDescriptionInput.value.trim(),
        price_yuan: readOptionalPrice(elements.apiKeyPriceInput),
        started_at: readDateTimeInput(elements.apiKeyStartedAtInput),
        stopped_at: readDateTimeInput(elements.apiKeyStoppedAtInput),
      };
    }

    const accessToken = elements.tokenAccessTokenInput.value.trim();
    if (!accessToken) throw new Error('access_token 必填');
    return {
      mode: state.editingAccountIndex !== null ? 'edit' : 'token',
      index: state.editingAccountIndex,
      type: 'token',
      description: elements.tokenEmailInput.value.trim(),
      alias: elements.tokenAliasInput.value.trim(),
      price_yuan: readOptionalPrice(elements.tokenPriceInput),
      started_at: readDateTimeInput(elements.tokenStartedAtInput),
      stopped_at: readDateTimeInput(elements.tokenStoppedAtInput),
      account_id: elements.tokenAccountIdInput.value.trim() || null,
      client_id: elements.tokenClientIdInput.value.trim() || null,
      access_token: accessToken,
      refresh_token: elements.tokenRefreshTokenInput.value.trim() || null,
    };
  }

  async function loadSnapshot(options = {}) {
    try {
      const snapshot = await invoke('get_desktop_snapshot', options.forceRefresh ? { forceRefresh: true } : undefined);
      state.snapshot = normalizeSnapshot(snapshot);
      renderAll();
    } catch (error) {
      elements.accountsGrid.innerHTML = `<div class="empty-state">${escapeHtml(error.message || error)}</div>`;
    }
  }

  function normalizeOptionalPort(value) {
    return value ? Number(value) : null;
  }

  function buildSettingsSaveMessage(previousSnapshot, nextSnapshot, settings) {
    const wasRunning = Boolean(previousSnapshot?.service?.running);
    if (!wasRunning) return '设置已保存';

    const previousPort = Number(previousSnapshot?.settings?.port || previousSnapshot?.service?.port || 3009);
    const nextPort = Number(nextSnapshot?.settings?.port || settings.port || 3009);
    const previousProxyPort = normalizeOptionalPort(previousSnapshot?.settings?.proxyPort);
    const nextProxyPort = normalizeOptionalPort(nextSnapshot?.settings?.proxyPort ?? settings.proxyPort);
    const messages = [];

    if (previousPort !== nextPort) {
      messages.push(`服务端口已切换到 ${nextPort}`);
    }
    if (previousProxyPort !== nextProxyPort) {
      messages.push(`代理端口已同步为 ${nextProxyPort || '未设置'}`);
    }

    return messages.length ? messages.join('，') : '设置已保存';
  }

  async function saveSettings() {
    const previousSnapshot = normalizeSnapshot(state.snapshot);
    try {
      const settings = readSettingsForm();
      const nextSnapshot = normalizeSnapshot(await invoke('save_desktop_settings', { settings }));
      state.snapshot = nextSnapshot;
      renderAll();
      showToast(buildSettingsSaveMessage(previousSnapshot, nextSnapshot, settings));
    } catch (error) {
      renderAll();
      showToast(`设置保存失败：${error.message || String(error)}`);
    }
  }

  async function toggleService() {
    if (state.serviceTransition) return;
    const command = state.snapshot.service?.running ? 'stop_service' : 'start_service';
    let settings = null;
    if (command === 'start_service') {
      try {
        settings = readSettingsForm();
      } catch (error) {
        renderAll();
        showToast(error.message || String(error));
        return;
      }
    }
    const transitionStartedAt = Date.now();
    let caughtError = null;
    setServiceTransition(command === 'start_service' ? 'starting' : 'stopping');
    try {
      await waitForServiceTransitionPaint();
      if (command === 'start_service') {
        await invoke('save_desktop_settings', { settings });
      }
      const service = await invoke(command);
      state.snapshot.service = { ...state.snapshot.service, ...(service || {}) };
      renderAll();
      await loadSnapshot({ silent: true });
    } catch (error) {
      caughtError = error;
    } finally {
      await waitForMinimumServiceTransition(transitionStartedAt, SERVICE_TRANSITION_MIN_MS);
      setServiceTransition(null);
    }
    if (caughtError) {
      showToast(caughtError.message || String(caughtError));
    }
  }

  async function saveAccount(event) {
    event.preventDefault();
    try {
      const request = readAccountForm();
      state.snapshot = normalizeSnapshot(await invoke('save_desktop_account', { request }));
      closeModalById('accountModal');
      renderAll();
    } catch (error) {
      setTokenJsonFeedback('error', error.message || String(error));
    }
  }

  async function deleteAccount(index) {
    const account = findAccount(index);
    const deleted = account ? Boolean(isDeletedAccount(account)) : false;
    const accountName = account ? getDisplayName(account) : `账号 #${index + 1}`;
    const choice = await requestConfirmation({
      title: deleted ? '彻底删除账号' : '删除账号',
      message: deleted
        ? `将从配置文件中彻底移除「${accountName}」，此操作不能在 App 内恢复。`
        : `删除「${accountName}」后，账号会停止参与请求和自动切换，但仍可在“已删除”中恢复。`,
      subject: accountName,
      primaryText: deleted ? '彻底删除' : '删除',
      primaryValue: deleted ? 'hard-delete' : 'soft-delete',
      secondaryText: deleted ? '' : '彻底删除',
      secondaryValue: 'hard-delete',
      danger: true,
    });
    if (!choice) return;
    if (choice === 'soft-delete') {
      const deletedAt = formatDateTimeInputValue(new Date());
      state.snapshot = normalizeSnapshot(await invoke('mark_desktop_account_deleted', {
        index,
        deleted_at: deletedAt,
        deletedAt,
      }));
    } else {
      state.snapshot = normalizeSnapshot(await invoke('delete_desktop_account', { index }));
    }
    renderAll();
  }

  function formatDateTimeInputValue(date) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
  }

  async function activateAccount(index) {
    state.snapshot = normalizeSnapshot(await invoke('activate_desktop_account', { index }));
    renderAll();
  }

  async function refreshAccount(index) {
    state.snapshot = normalizeSnapshot(await invoke('refresh_desktop_account', { index }));
    renderAll();
  }

  async function toggleAccountAutoSwitch(index) {
    const account = findAccount(index);
    const disabled = !Boolean(normalizeAccount(account).item?.auto_switch_disabled);
    const accountName = account ? getDisplayName(account) : `账号 #${index + 1}`;
    const confirmed = await requestConfirmation({
      title: disabled ? '禁止自动切入' : '允许自动切入',
      message: disabled
        ? `确认后「${accountName}」不会被自动切换选中，但仍可手动切换。`
        : `确认后「${accountName}」在可用时可以被自动切换选中。`,
      subject: accountName,
      primaryText: disabled ? '禁止自动切入' : '允许自动切入',
      primaryValue: 'confirm',
      secondaryText: '',
    });
    if (!confirmed) return;
    state.snapshot = normalizeSnapshot(await invoke('toggle_desktop_account_auto_switch', { index, disabled }));
    renderAll();
  }

  async function restoreAccount(index) {
    state.snapshot = normalizeSnapshot(await invoke('restore_desktop_account', { index }));
    renderAll();
  }

  async function runCardAction(action, index, button) {
    if (!Number.isInteger(index)) return;
    const invokesBackend = !['edit'].includes(action);
    if (invokesBackend) setCardActionLoading(button, true);
    try {
      if (action === 'activate') await activateAccount(index);
      if (action === 'refresh') await refreshAccount(index);
      if (action === 'toggle-auto-switch') await toggleAccountAutoSwitch(index);
      if (action === 'restore') await restoreAccount(index);
      if (action === 'edit') openEditAccountModal(index);
      if (action === 'delete') await deleteAccount(index);
    } catch (error) {
      window.alert(error.message || String(error));
    } finally {
      if (invokesBackend) setCardActionLoading(button, false);
    }
  }

  function setCardActionLoading(button, loading) {
    button.classList.toggle('loading', loading);
    button.disabled = loading;
    button.setAttribute('aria-busy', loading ? 'true' : 'false');
  }

  function requestConfirmation(options) {
    if (!elements.confirmModal) return Promise.resolve(null);
    elements.confirmModalTitle.textContent = options.title || '确认操作';
    setConfirmationMessage(options);
    elements.confirmModalPrimaryButton.textContent = options.primaryText || '确认';
    elements.confirmModalPrimaryButton.dataset.confirmValue = options.primaryValue || 'confirm';
    elements.confirmModalPrimaryButton.classList.toggle('dialog-button-danger', Boolean(options.danger));
    elements.confirmModalSecondaryButton.hidden = !options.secondaryText;
    elements.confirmModalSecondaryButton.textContent = options.secondaryText || '';
    elements.confirmModalSecondaryButton.dataset.confirmValue = options.secondaryValue || 'secondary';
    elements.confirmModal.hidden = false;
    window.setTimeout(() => elements.confirmModalDialog?.focus(), 0);
    return new Promise(resolve => {
      state.confirmResolver = resolve;
    });
  }

  function setConfirmationMessage(options) {
    const message = String(options.message || '');
    const subject = String(options.subject || '');
    const marker = subject ? `「${subject}」` : '';
    const markerIndex = marker ? message.indexOf(marker) : -1;
    if (markerIndex < 0) {
      elements.confirmModalMessage.textContent = message;
      return;
    }

    const highlightedSubject = document.createElement('strong');
    highlightedSubject.className = 'confirm-subject';
    highlightedSubject.textContent = marker;
    elements.confirmModalMessage.replaceChildren(
      document.createTextNode(message.slice(0, markerIndex)),
      highlightedSubject,
      document.createTextNode(message.slice(markerIndex + marker.length)),
    );
  }

  function resolveConfirmation(value) {
    if (elements.confirmModal) elements.confirmModal.hidden = true;
    const resolver = state.confirmResolver;
    state.confirmResolver = null;
    resolver?.(value);
  }

  function showToast(message) {
    if (!elements.toast) return;
    window.clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    state.toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 1800);
  }

  function toggleSecretInput(inputId, button) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const showing = input.type === 'text';
    const nextVisible = !showing;
    input.type = nextVisible ? 'text' : 'password';
    const nextTitle = nextVisible ? '隐藏明文' : '显示明文';
    button.innerHTML = renderEyeIcon(nextVisible);
    button.setAttribute('title', nextTitle);
    button.setAttribute('aria-label', nextTitle);
    button.classList.toggle('active', nextVisible);
  }

  async function saveAccessToken(event) {
    event.preventDefault();
    const token = generateAccessToken();
    state.snapshot = normalizeSnapshot(await invoke('save_access_token', {
      request: {
        name: '',
        token,
      },
    }));
    elements.tokenForm.reset();
    closeModalById('tokenModal');
    renderAll();
  }

  function generateAccessToken() {
    const bytes = new Uint8Array(18);
    if (window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    return `sk-ai-cockpit-${[...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
  }

  async function deleteAccessToken(index) {
    const token = (state.snapshot.accessTokens || []).find(item => item.index === index);
    const tokenName = token ? text(token.name, `令牌 #${index + 1}`) : `令牌 #${index + 1}`;
    const confirmed = await requestConfirmation({
      title: '删除访问令牌',
      message: `确定删除「${tokenName}」吗？删除后使用该令牌的客户端将无法继续访问 AI Cockpit。`,
      subject: tokenName,
      primaryText: '删除',
      primaryValue: 'delete',
      danger: true,
    });
    if (confirmed !== 'delete') return;
    state.snapshot = normalizeSnapshot(await invoke('delete_access_token', { index }));
    renderAll();
    showToast('令牌已删除');
  }

  async function copyAccessToken(index) {
    const token = (state.snapshot.accessTokens || []).find(item => item.index === index);
    if (!token?.token) return;
    await navigator.clipboard?.writeText(token.token);
    showToast('复制成功');
  }

  function bindEvents() {
    elements.navButtons.forEach(button => {
      button.addEventListener('click', () => button.dataset.page && setPage(button.dataset.page));
    });
    elements.openSettingsButton?.addEventListener('click', () => setPage('settings'));
    elements.openAddAccountModalButton.addEventListener('click', openAddAccountModal);
    elements.emptyAddAccountButton.addEventListener('click', openAddAccountModal);
    elements.accountSearchInput.addEventListener('input', renderAccounts);
    elements.filterButtons.forEach(button => {
      button.addEventListener('click', () => {
        if (button.dataset.filterType === 'deleted') {
          state.filterType = state.filterType === 'deleted' ? 'all' : 'deleted';
        } else {
          state.filterType = button.dataset.filterType || 'all';
        }
        renderAccounts();
      });
    });
    elements.accountSortSelect.addEventListener('change', () => {
      state.sortBy = elements.accountSortSelect.value;
      renderAccounts();
    });
    elements.sortDirectionButton.addEventListener('click', () => {
      state.sortDirection = state.sortDirection === 'desc' ? 'asc' : 'desc';
      elements.sortDirectionButton.textContent = state.sortDirection === 'desc' ? '↓' : '↑';
      renderAccounts();
    });
    elements.accountModeButtons.forEach(button => {
      button.addEventListener('click', () => showAccountMode(button.dataset.accountMode));
    });
    elements.parseTokenJsonButton.addEventListener('click', parseTokenJson);
    elements.accountForm.addEventListener('submit', saveAccount);
    elements.serviceToggleButton.addEventListener('click', toggleService);
    elements.settingsServicePortInput.addEventListener('change', saveSettings);
    elements.settingsProxyPortInput.addEventListener('change', saveSettings);
    elements.routingPreferenceSelect.addEventListener('change', saveSettings);
    elements.autoSwitchInput.addEventListener('change', saveSettings);
    elements.checkUpdateButton.addEventListener('click', handleUpdateButton);
    elements.openTokenModalButton.addEventListener('click', () => openModal(elements.tokenModal));
    elements.tokenForm.addEventListener('submit', saveAccessToken);

    document.addEventListener('click', event => {
      const closeButton = event.target.closest('[data-close-modal]');
      if (closeButton) {
        closeModalById(closeButton.dataset.closeModal);
        return;
      }

      const cardButton = event.target.closest('[data-card-action]');
      if (cardButton) {
        const index = Number(cardButton.dataset.index);
        void runCardAction(cardButton.dataset.cardAction, index, cardButton);
        return;
      }

      const secretButton = event.target.closest('[data-secret-toggle]');
      if (secretButton) {
        toggleSecretInput(secretButton.dataset.secretToggle, secretButton);
        return;
      }

      const tokenButton = event.target.closest('[data-token-action]');
      if (tokenButton) {
        const index = Number(tokenButton.dataset.index);
        if (tokenButton.dataset.tokenAction === 'delete') void deleteAccessToken(index);
        if (tokenButton.dataset.tokenAction === 'copy') void copyAccessToken(index);
      }
    });

    elements.confirmModalPrimaryButton?.addEventListener('click', () => {
      resolveConfirmation(elements.confirmModalPrimaryButton.dataset.confirmValue || 'confirm');
    });
    elements.confirmModalSecondaryButton?.addEventListener('click', () => {
      resolveConfirmation(elements.confirmModalSecondaryButton.dataset.confirmValue || 'secondary');
    });
    elements.confirmModalCancelButton?.addEventListener('click', () => resolveConfirmation(null));
    elements.confirmModalCloseButton?.addEventListener('click', () => resolveConfirmation(null));

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeModalById('accountModal');
        closeModalById('tokenModal');
        resolveConfirmation(null);
      }
    });
  }

  async function listenForTauriEvents() {
    const eventApi = window.__TAURI__?.event;
    if (!eventApi?.listen) return;
    await Promise.all([
      eventApi.listen('airouter-startup-complete', () => loadSnapshot({ silent: true })),
      eventApi.listen('airouter-startup-error', () => loadSnapshot({ silent: true })),
      eventApi.listen('airouter-config-missing', () => loadSnapshot({ silent: true })),
    ]);
  }

  async function initialize() {
    initializeTheme(elements.themeModeControl);
    bindEvents();
    setPage('accounts');
    await listenForTauriEvents();
    await loadAppVersion();
    await loadSnapshot();
    void checkForUpdates({ automatic: true });
    window.setInterval(() => loadSnapshot({ silent: true }), 30000);
  }

  initialize();
