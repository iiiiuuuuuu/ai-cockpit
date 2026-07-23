import { waitForMinimumDuration, waitForMinimumServiceTransition, waitForServiceTransitionPaint } from './actions.js';
import { getAuthJsonDisplayPath, parseTokenJsonObject } from './account-import.js';
import {
  classifyBatchImportRecords,
  getBatchImportSummary,
  parseBatchAccountSources,
  selectBatchImportAccounts,
} from './batch-import.js';
import { createBatchExportController } from './batch-export.js';
import {
  text,
  normalizeAccount,
  isApiKeyAccount,
  isSub2ApiAccount,
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
  formatDeletedAt,
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
  getAccountRefreshResult,
  getHealthText,
  getUnavailableReasonText,
  formatReason,
  getAvailability,
  maskSecret,
} from './account-model.js';
import { escapeHtml, renderEyeIcon } from './render.js';
import {
  bindAccountReorder,
  createReorderDraft,
  moveReorderIndex,
  orderAccountsByDraft,
} from './reorder.js';
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
  const UPDATE_CHECK_MIN_MS = 600;

  const elements = {
    pages: [...document.querySelectorAll('.page')],
    navButtons: [...document.querySelectorAll('[data-page]')],
    serviceStatusLabel: document.querySelector('#serviceStatusLabel'),
    serviceStatusText: document.querySelector('#serviceStatusText'),
    accountSearchInput: document.querySelector('#accountSearchInput'),
    filterButtons: [...document.querySelectorAll('[data-filter-type]')],
    filterCountElements: [...document.querySelectorAll('[data-filter-count]')],
    deletedAccountsFilterButton: document.querySelector('[data-filter-type="deleted"]'),
    accountSortSelect: document.querySelector('#accountSortSelect'),
    sortDirectionButton: document.querySelector('#sortDirectionButton'),
    openAccountReorderButton: document.querySelector('#openAccountReorderButton'),
    accountReorderActions: document.querySelector('#accountReorderActions'),
    cancelAccountReorderButton: document.querySelector('#cancelAccountReorderButton'),
    saveAccountReorderButton: document.querySelector('#saveAccountReorderButton'),
    routingSummary: document.querySelector('#routingSummary'),
    accountsGrid: document.querySelector('#accountsGrid'),
    emptyAccountsState: document.querySelector('#emptyAccountsState'),
    addAccountActions: document.querySelector('#addAccountActions'),
    openAddAccountModalButton: document.querySelector('#openAddAccountModalButton'),
    toggleBatchImportMenuButton: document.querySelector('#toggleBatchImportMenuButton'),
    batchImportMenu: document.querySelector('#batchImportMenu'),
    openBatchImportButton: document.querySelector('#openBatchImportButton'),
    openBatchExportButton: document.querySelector('#openBatchExportButton'),
    emptyAddAccountButton: document.querySelector('#emptyAddAccountButton'),
    openSettingsButton: document.querySelector('#openSettingsButton'),
    accountModal: document.querySelector('#accountModal'),
    batchImportModal: document.querySelector('#batchImportModal'),
    batchImportModalDialog: document.querySelector('.batch-import-modal'),
    batchImportPanels: [...document.querySelectorAll('[data-batch-import-panel]')],
    batchImportSteps: [...document.querySelectorAll('[data-batch-import-step]')],
    batchImportActions: [...document.querySelectorAll('[data-batch-import-actions]')],
    batchImportDropzone: document.querySelector('#batchImportDropzone'),
    batchImportFileInput: document.querySelector('#batchImportFileInput'),
    batchImportExistingPolicy: document.querySelector('#batchImportExistingPolicy'),
    batchImportParsedTitle: document.querySelector('#batchImportParsedTitle'),
    batchImportSourceSummary: document.querySelector('#batchImportSourceSummary'),
    batchImportSummary: document.querySelector('#batchImportSummary'),
    batchImportTableBody: document.querySelector('#batchImportTableBody'),
    batchImportFooterNote: document.querySelector('#batchImportFooterNote'),
    batchImportReselectButton: document.querySelector('#batchImportReselectButton'),
    confirmBatchImportButton: document.querySelector('#confirmBatchImportButton'),
    batchImportResultImported: document.querySelector('#batchImportResultImported'),
    batchImportResultUpdated: document.querySelector('#batchImportResultUpdated'),
    batchImportResultSkipped: document.querySelector('#batchImportResultSkipped'),
    batchExportModal: document.querySelector('#batchExportModal'),
    batchExportSearchInput: document.querySelector('#batchExportSearchInput'),
    batchExportFilterButtons: [...document.querySelectorAll('[data-batch-export-filter]')],
    batchExportCounts: [...document.querySelectorAll('[data-batch-export-count]')],
    batchExportScopeButtons: [...document.querySelectorAll('[data-batch-export-scope]')],
    batchExportSelectionSummary: document.querySelector('#batchExportSelectionSummary'),
    batchExportPageCheckbox: document.querySelector('#batchExportPageCheckbox'),
    batchExportTableBody: document.querySelector('#batchExportTableBody'),
    batchExportRange: document.querySelector('#batchExportRange'),
    batchExportPageLabel: document.querySelector('#batchExportPageLabel'),
    batchExportPreviousButton: document.querySelector('#batchExportPreviousButton'),
    batchExportNextButton: document.querySelector('#batchExportNextButton'),
    confirmBatchExportButton: document.querySelector('#confirmBatchExportButton'),
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
    sub2ApiAccountIdInput: document.querySelector('#tokenSub2ApiAccountIdInput'),
    tokenSub2ApiRuntimeIdInput: document.querySelector('#tokenSub2ApiRuntimeIdInput'),
    tokenSub2ApiUserIdInput: document.querySelector('#tokenSub2ApiUserIdInput'),
    tokenSub2ApiTaskIdInput: document.querySelector('#tokenSub2ApiTaskIdInput'),
    tokenSub2ApiPrivateKeyInput: document.querySelector('#tokenSub2ApiPrivateKeyInput'),
    sub2ApiFields: [...document.querySelectorAll('[data-sub2api-only]')],
    standardTokenFields: [...document.querySelectorAll('[data-standard-token-only]')],
    tokenAccessTokenInput: document.querySelector('#tokenAccessTokenInput'),
    tokenRefreshTokenInput: document.querySelector('#tokenRefreshTokenInput'),
    tokenJsonInput: document.querySelector('#tokenJsonInput'),
    parseTokenJsonButton: document.querySelector('#parseTokenJsonButton'),
    tokenJsonFeedback: document.querySelector('#tokenJsonFeedback'),
    tokenParseStatus: document.querySelector('#tokenParseStatus'),
    authJsonDisplayPath: document.querySelector('#authJsonDisplayPath'),
    openTokenFormatButton: document.querySelector('#openTokenFormatButton'),
    tokenFormatDialog: document.querySelector('#tokenFormatDialog'),
    closeTokenFormatButton: document.querySelector('#closeTokenFormatButton'),
    tokenFormatButtons: [...document.querySelectorAll('[data-token-format]')],
    tokenFormatExamples: [...document.querySelectorAll('[data-token-format-example]')],
    addOnlyFields: [...document.querySelectorAll('[data-add-only]')],
    editOnlyFields: [...document.querySelectorAll('[data-edit-only]')],
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
    availableUpdateButton: document.querySelector('#availableUpdateButton'),
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
  const batchExportController = createBatchExportController({
    getAccounts: () => state.snapshot.accounts,
    invoke,
    close: () => closeModalById('batchExportModal'),
    showToast,
    elements: {
      modal: elements.batchExportModal,
      searchInput: elements.batchExportSearchInput,
      filterButtons: elements.batchExportFilterButtons,
      counts: elements.batchExportCounts,
      scopeButtons: elements.batchExportScopeButtons,
      selectionSummary: elements.batchExportSelectionSummary,
      pageCheckbox: elements.batchExportPageCheckbox,
      tableBody: elements.batchExportTableBody,
      range: elements.batchExportRange,
      pageLabel: elements.batchExportPageLabel,
      previousButton: elements.batchExportPreviousButton,
      nextButton: elements.batchExportNextButton,
      confirmButton: elements.confirmBatchExportButton,
    },
  });

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
    const sub2Api = isSub2ApiAccount(normalized);
    const deleted = Boolean(isDeletedAccount(normalized));
    const reordering = state.reorderMode && !deleted;
    const available = getAvailability(normalized);
    const usage = formatUsageDays(normalized);
    const price = formatPrice(normalized);
    const typeClass = apiKey ? 'apikey' : 'token';
    const typeLabel = apiKey ? 'API KEY' : sub2Api ? 'TOKEN · SUB2API' : 'TOKEN';
    const titleParts = resolveAccountTitleParts(normalized);
    const subtitle = titleParts.subtitle;
    const availabilityText = available ? '可用' : '不可用';
    const cardClass = [
      'account-card',
      normalized.is_active ? 'current' : '',
      deleted ? 'deleted' : '',
      reordering ? 'reordering' : '',
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
    const refreshResult = getAccountRefreshResult(normalized);
    const deletedCheckResult = deleted && refreshResult.checked
      ? `<span class="check-result ${refreshResult.ok ? 'success' : 'error'}"> · ${escapeHtml(refreshResult.message)}</span>`
      : '';
    const detailText = deleted
      ? `删除时间：${formatDeletedAt(item.deleted_at) || '未知'}`
      : available
        ? selectionReason
          ? `当前使用：${selectionReason}`
          : `状态：${getHealthText(normalized)}`
        : `不可用原因：${getUnavailableReasonText(normalized)}`;
    const autoSwitchDisabled = Boolean(item.auto_switch_disabled);
    const indexText = escapeHtml(String(normalized.index));
    const reorderPosition = state.reorderDraft.indexOf(normalized.index) + 1;
    const cardActions = reordering
      ? `<span class="reorder-position">第 ${reorderPosition} 位</span>`
      : deleted
      ? `
            <button class="icon" type="button" data-card-action="refresh" data-index="${indexText}" title="${apiKey ? '测试此 API Key 上游是否可用' : '刷新此账号额度'}" aria-label="${apiKey ? '测试此 API Key 上游是否可用' : '刷新此账号额度'}">↻</button>
            <button class="icon" type="button" data-card-action="restore" data-index="${indexText}" title="恢复账号" aria-label="恢复账号">↩</button>
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
          ${reordering ? `<button class="drag-handle" type="button" data-reorder-handle="${indexText}" title="拖动调整顺序，也可使用方向键" aria-label="调整 ${escapeHtml(titleParts.title)} 的顺序">⠿</button>` : ''}
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
            <div title="${deletedCheckResult ? escapeHtml(refreshResult.message) : ''}">最后检查：${escapeHtml(formatLastChecked(normalized))}${deletedCheckResult}</div>
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
    const unfilteredCounts = getAccountFilterCounts(sourceAccounts, '');
    const counts = getAccountFilterCounts(sourceAccounts, searchQuery);
    const totalDeleted = unfilteredCounts.deleted;
    const hasStoredAccounts = unfilteredCounts.all > 0;
    const reordering = state.reorderMode;

    if (elements.deletedAccountsFilterButton) {
      elements.deletedAccountsFilterButton.hidden = totalDeleted === 0 || reordering;
    }
    if (totalDeleted === 0 && state.filterType === 'deleted') {
      state.filterType = 'all';
    }
    const deletedView = state.filterType === 'deleted';
    const sortingLocked = deletedView || reordering;
    elements.accountSearchInput.disabled = reordering;
    elements.accountSortSelect.disabled = sortingLocked;
    elements.sortDirectionButton.disabled = sortingLocked;
    const sortTitle = reordering
      ? '调整顺序时不可使用其他排序'
      : deletedView ? '已删除账号按删除时间倒序排列' : '';
    elements.accountSortSelect.title = sortTitle;
    elements.sortDirectionButton.title = sortTitle || '切换升降序';
    elements.openAccountReorderButton.hidden = reordering || unfilteredCounts.all < 2;
    elements.accountReorderActions.hidden = !reordering;
    elements.saveAccountReorderButton.disabled = state.reorderSaving;
    elements.filterCountElements.forEach(element => {
      element.textContent = String(counts[element.dataset.filterCount] || 0);
    });
    elements.filterButtons.forEach(button => {
      button.disabled = reordering;
      button.classList.toggle('active', button.dataset.filterType === state.filterType);
    });

    const accounts = reordering
      ? orderAccountsByDraft(
        sourceAccounts.filter(account => !isDeletedAccount(account)),
        state.reorderDraft,
      )
      : sortAccounts(filterAccounts(
        sourceAccounts,
        state,
        searchQuery,
      ), state);
    elements.accountsGrid.classList.toggle('reorder-mode', reordering);
    elements.accountsGrid.innerHTML = accounts.map(renderAccountCard).join('');
    const hasAccounts = accounts.length > 0;
    elements.accountsGrid.hidden = !hasAccounts;
    elements.addAccountActions.hidden = reordering;
    elements.emptyAccountsState.hidden = hasAccounts || hasStoredAccounts;
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
    elements.availableUpdateButton.hidden = !updateAvailable;
    elements.availableUpdateButton.innerHTML = updateAvailable
      ? `<span>有新版本 v${escapeHtml(info.latestVersion)}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3 6.5 9.5M11 9.5V13H3V5h3.5"></path></svg>`
      : '';
    elements.checkUpdateButton.disabled = state.update.checking;
    elements.checkUpdateButton.classList.toggle('loading', state.update.checking);
    elements.checkUpdateButton.innerHTML = state.update.checking
      ? '<span class="update-spinner" aria-hidden="true"></span><span>检查中</span>'
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

    const updateCheckStartedAt = Date.now();
    let feedbackMessage = '';
    state.update.checking = true;
    renderUpdate();
    try {
      const info = await fetchLatestRelease(state.appVersion);
      state.update.info = info;
      writeCachedUpdate(info);
      if (!automatic && !info.updateAvailable) {
        feedbackMessage = info.releasePublished === false ? '当前暂无可下载的新版本' : '当前已是最新版本';
      }
    } catch (error) {
      if (!automatic) feedbackMessage = error.message || String(error);
    } finally {
      await waitForMinimumDuration(updateCheckStartedAt, UPDATE_CHECK_MIN_MS);
      state.update.checking = false;
      renderUpdate();
    }
    if (feedbackMessage) showToast(feedbackMessage);
  }

  async function handleUpdateButton() {
    await checkForUpdates();
  }

  async function handleAvailableUpdateButton() {
    const info = state.update.info;
    if (!info?.updateAvailable) return;
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
    if (state.reorderMode && page === 'settings') {
      finishAccountReorder();
      renderAccounts();
    }
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
    setSub2ApiFieldsVisible(state.accountModalMode === 'token' && state.accountModalSubtype === 'sub2api');
    elements.accountModeTabs.hidden = false;
    if (state.editingAccountIndex === null) {
      elements.accountModalSubtitle.hidden = false;
      elements.accountModalSubtitle.textContent = state.accountModalMode === 'apikey'
        ? '配置服务商提供的接口地址与 API Key，并完善账号资料。'
        : '导入 ChatGPT/Codex 登录信息，并确认账号资料。';
    }
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
    const preferredInput = modal === elements.accountModal
      ? modal.querySelector('[data-modal-autofocus]')
      : null;
    const activePanelInput = modal === elements.accountModal
      ? [...modal.querySelectorAll('.mode-panel.active input:not(:disabled), .mode-panel.active textarea:not(:disabled)')]
        .find(input => input.offsetParent !== null)
      : null;
    const firstInput = preferredInput?.offsetParent !== null
      ? preferredInput
      : activePanelInput || modal.querySelector('input, textarea, select, button');
    window.setTimeout(() => firstInput?.focus(), 0);
  }

  function closeModalById(id) {
    const modal = document.getElementById(id);
    if (modal) modal.hidden = true;
    state.editingAccountIndex = null;
  }

  function clearAccountForm() {
    elements.accountForm.reset();
    state.accountModalSubtype = '';
    state.accountModalCredentials = null;
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
    if (elements.tokenFormatDialog) elements.tokenFormatDialog.hidden = true;
    showTokenFormat('session');
    setSub2ApiFieldsVisible(false);
  }

  function setSub2ApiFieldsVisible(visible) {
    elements.sub2ApiFields.forEach(field => {
      field.hidden = !visible;
    });
    elements.standardTokenFields.forEach(field => {
      field.hidden = visible;
    });
    if (elements.tokenAccessTokenInput) {
      elements.tokenAccessTokenInput.required = !visible;
    }
    if (elements.saveAccountButton && state.accountModalMode === 'token') {
      elements.saveAccountButton.textContent = state.editingAccountIndex === null
        ? (visible ? '添加 Sub2API 账号' : '添加 Token 账号')
        : (visible ? '保存账号' : '保存');
    }
  }

  function setEditOnlyFieldsVisible(visible) {
    elements.editOnlyFields.forEach(field => {
      field.hidden = !visible;
    });
  }

  function setAddOnlyFieldsVisible(visible) {
    elements.addOnlyFields.forEach(field => {
      field.hidden = !visible;
    });
  }

  function showTokenFormat(format) {
    const selected = ['session', 'app', 'sub2api'].includes(format) ? format : 'session';
    elements.tokenFormatButtons.forEach(button => {
      const active = button.dataset.tokenFormat === selected;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    elements.tokenFormatExamples.forEach(example => {
      example.classList.toggle('active', example.dataset.tokenFormatExample === selected);
    });
  }

  async function openAccountHelpPage(url) {
    try {
      await invoke('open_account_help_page', { url });
    } catch (error) {
      showToast(`无法打开页面：${error.message || String(error)}`);
    }
  }

  function openAddAccountModal() {
    setBatchImportMenuOpen(false);
    state.editingAccountIndex = null;
    clearAccountForm();
    const defaultStartedAt = formatDateTimeLocalValue(new Date());
    elements.tokenStartedAtInput.value = defaultStartedAt;
    elements.apiKeyStartedAtInput.value = defaultStartedAt;
    setAddOnlyFieldsVisible(true);
    setEditOnlyFieldsVisible(false);
    elements.accountModalTitle.textContent = '添加账号';
    elements.accountModalSubtitle.hidden = false;
    elements.accountModalSubtitle.textContent = '导入 ChatGPT/Codex 登录信息，并确认账号资料。';
    showAccountMode('token');
    openModal(elements.accountModal);
  }

  const batchImportStatusMeta = {
    new: { label: '新账号', tone: 'good' },
    existing: { label: '已存在', tone: '' },
    credential_changed: { label: '凭证有变化', tone: 'warn' },
    suspected_duplicate: { label: '疑似重复', tone: 'warn' },
    batch_duplicate: { label: '批次内重复', tone: 'warn' },
    deleted: { label: '已删除', tone: 'warn' },
    invalid: { label: '格式错误', tone: 'bad' },
  };

  function setBatchImportMenuOpen(open) {
    const visible = Boolean(open);
    elements.batchImportMenu.hidden = !visible;
    elements.toggleBatchImportMenuButton.setAttribute('aria-expanded', visible ? 'true' : 'false');
  }

  function resetBatchImport() {
    state.batchImport = {
      stage: 'files',
      sources: [],
      preview: [],
      processing: false,
      result: null,
    };
    elements.batchImportFileInput.value = '';
    elements.batchImportExistingPolicy.value = 'skip';
    elements.batchImportTableBody.innerHTML = '';
    elements.batchImportSummary.innerHTML = '';
    elements.batchImportParsedTitle.textContent = '已解析 0 个账号';
    elements.batchImportSourceSummary.textContent = '';
    setBatchImportStage('files');
  }

  function setBatchImportStage(stage) {
    const stages = ['files', 'preview', 'result'];
    const selected = stages.includes(stage) ? stage : 'files';
    const selectedIndex = stages.indexOf(selected);
    state.batchImport.stage = selected;
    elements.batchImportModalDialog.dataset.stage = selected;
    elements.batchImportPanels.forEach(panel => {
      const active = panel.dataset.batchImportPanel === selected;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
    });
    elements.batchImportActions.forEach(actions => {
      actions.hidden = actions.dataset.batchImportActions !== selected;
    });
    elements.batchImportSteps.forEach(step => {
      const index = stages.indexOf(step.dataset.batchImportStep);
      step.classList.toggle('active', index === selectedIndex);
      step.classList.toggle('done', index < selectedIndex);
    });
    elements.batchImportFooterNote.textContent = selected === 'files'
      ? '文件只在本机解析，确认前不会修改现有账号。'
      : selected === 'preview'
        ? elements.batchImportFooterNote.textContent
        : '原配置已自动保留，导入出现异常时会自动恢复。';
  }

  function openBatchImportModal() {
    setBatchImportMenuOpen(false);
    resetBatchImport();
    openModal(elements.batchImportModal);
  }

  function batchImportAccountTitle(record) {
    const account = record.account || {};
    if (!record.account) return record.source;
    if (account.mode === 'apikey') {
      return account.alias || account.description || account.base_url || '未命名';
    }
    return account.alias || account.description || account.account_id || '未命名';
  }

  function batchImportAccountDetail(record) {
    const account = record.account || {};
    if (account.mode === 'apikey') return account.base_url || '';
    if (account.alias && account.description) return account.description;
    return account.account_id || '';
  }

  function batchImportAction(record, updateExisting) {
    if (record.status === 'new') return '导入';
    if (record.status === 'credential_changed' && updateExisting) return '更新';
    return '跳过';
  }

  function renderBatchImportPreview() {
    const preview = state.batchImport.preview || [];
    const updateExisting = elements.batchImportExistingPolicy.value === 'update';
    const selected = selectBatchImportAccounts(preview, updateExisting);
    const summary = getBatchImportSummary(preview);
    const sourceCount = state.batchImport.sources.length;
    const summaryItems = [
      ['new', '可导入', 'good'],
      ['existing', '已存在', ''],
      ['credential_changed', '凭证变化', 'warn'],
      ['suspected_duplicate', '疑似重复', 'warn'],
      ['batch_duplicate', '批次内重复', 'warn'],
      ['deleted', '已删除', 'warn'],
      ['invalid', '格式错误', 'bad'],
    ];

    elements.batchImportParsedTitle.textContent = `已解析 ${summary.total} 个账号`;
    elements.batchImportSourceSummary.textContent = `来自 ${sourceCount} 个文件`;
    elements.batchImportSummary.innerHTML = summaryItems
      .filter(([key]) => summary[key] > 0)
      .map(([key, label, tone]) => `<span class="${tone}">${label} ${summary[key]}</span>`)
      .join('');
    elements.batchImportTableBody.innerHTML = preview.map(record => {
      const meta = batchImportStatusMeta[record.status] || batchImportStatusMeta.invalid;
      const statusText = record.status === 'invalid' ? record.error : meta.label;
      const type = record.account?.mode === 'apikey' ? 'API KEY' : record.account ? 'TOKEN' : '-';
      return `
        <tr>
          <td><span class="batch-import-account-name" title="${escapeHtml(batchImportAccountTitle(record))}">${escapeHtml(batchImportAccountTitle(record))}</span><span class="batch-import-account-detail" title="${escapeHtml(batchImportAccountDetail(record))}">${escapeHtml(batchImportAccountDetail(record))}</span></td>
          <td><span class="batch-import-type">${type}</span></td>
          <td><span class="batch-import-source" title="${escapeHtml(record.source)}">${escapeHtml(record.source)}</span></td>
          <td><span class="batch-import-status ${meta.tone}" title="${escapeHtml(statusText)}">${escapeHtml(statusText)}</span></td>
          <td>${batchImportAction(record, updateExisting)}</td>
        </tr>`;
    }).join('');
    elements.confirmBatchImportButton.textContent = `导入 ${selected.length} 个`;
    elements.confirmBatchImportButton.disabled = selected.length === 0 || state.batchImport.processing;
    const updateCount = updateExisting ? summary.credential_changed : 0;
    elements.batchImportFooterNote.textContent = updateCount > 0
      ? `将导入 ${summary.new} 个新账号并更新 ${updateCount} 个已有账号凭证。`
      : `不会覆盖已有账号，本次将导入 ${summary.new} 个新账号。`;
  }

  async function readBatchImportFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const totalBytes = files.reduce((total, file) => total + Number(file.size || 0), 0);
    if (totalBytes > 25 * 1024 * 1024) {
      showToast('选择的 JSON 文件总大小不能超过 25 MB');
      return;
    }

    try {
      const sources = await Promise.all(files.map(async file => ({
        name: file.name,
        content: await file.text(),
      })));
      const records = parseBatchAccountSources(sources, {
        startedAt: formatDateTimeLocalValue(new Date()),
      });
      state.batchImport.sources = sources;
      state.batchImport.preview = classifyBatchImportRecords(records, state.snapshot.accounts);
      setBatchImportStage('preview');
      renderBatchImportPreview();
    } catch (error) {
      showToast(`无法读取 JSON 文件：${error.message || String(error)}`);
    }
  }

  async function confirmBatchImport() {
    if (state.batchImport.processing) return;
    const updateExisting = elements.batchImportExistingPolicy.value === 'update';
    const accounts = selectBatchImportAccounts(state.batchImport.preview, updateExisting);
    if (!accounts.length) return;

    state.batchImport.processing = true;
    elements.confirmBatchImportButton.disabled = true;
    elements.confirmBatchImportButton.textContent = '导入中…';
    elements.batchImportExistingPolicy.disabled = true;
    elements.batchImportReselectButton.disabled = true;
    elements.batchImportModal.querySelectorAll('[data-close-modal]').forEach(button => {
      button.disabled = true;
    });
    try {
      const response = await invoke('import_desktop_accounts', { accounts, updateExisting });
      state.snapshot = normalizeSnapshot(response.snapshot);
      const imported = Number(response.imported || 0);
      const updated = Number(response.updated || 0);
      const skipped = Math.max(0, state.batchImport.preview.length - imported - updated);
      state.batchImport.result = { imported, updated, skipped };
      elements.batchImportResultImported.textContent = String(imported);
      elements.batchImportResultUpdated.textContent = String(updated);
      elements.batchImportResultSkipped.textContent = String(skipped);
      renderAll();
      setBatchImportStage('result');
    } catch (error) {
      showToast(`批量导入失败：${error.message || String(error)}`);
      renderBatchImportPreview();
    } finally {
      state.batchImport.processing = false;
      elements.batchImportExistingPolicy.disabled = false;
      elements.batchImportReselectButton.disabled = false;
      elements.batchImportModal.querySelectorAll('[data-close-modal]').forEach(button => {
        button.disabled = false;
      });
      if (state.batchImport.stage === 'preview') renderBatchImportPreview();
    }
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
    setAddOnlyFieldsVisible(false);
    setEditOnlyFieldsVisible(true);
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

  function parseTokenJson() {
    const raw = elements.tokenJsonInput.value.trim();
    if (!raw) {
      setTokenJsonFeedback('error', '请先粘贴 Token JSON。');
      return null;
    }

    try {
      const parsed = JSON.parse(raw);
      const fields = parseTokenJsonObject(parsed, { startedAt: elements.tokenStartedAtInput.value });
      if (!fields.access_token && fields.subtype !== 'sub2api') {
        throw new Error('未找到 access_token，请确认粘贴了完整的登录 JSON');
      }
      fillTokenFields(fields);
      const populatedCount = [
        fields.description,
        fields.account_id,
        fields.client_id,
        fields.access_token,
        fields.refresh_token,
        fields.credentials?.agent_runtime_id,
      ].filter(Boolean).length;
      const message = fields.subtype === 'sub2api'
        ? `已识别 Sub2API Agent Identity，已填充 ${populatedCount} 个字段，无需访问令牌。`
        : `JSON 已解析并填充 ${populatedCount} 个字段。`;
      setTokenJsonFeedback('success', message);
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
    state.accountModalSubtype = fields.subtype === 'sub2api' ? 'sub2api' : '';
    state.accountModalCredentials = fields.subtype === 'sub2api'
      ? { ...(fields.credentials || {}) }
      : null;
    elements.tokenEmailInput.value = fields.description || '';
    elements.tokenAliasInput.value = fields.alias || '';
    elements.tokenPriceInput.value = fields.price_yuan || '';
    setDateTimeInput(elements.tokenStartedAtInput, fields.started_at);
    setDateTimeInput(elements.tokenStoppedAtInput, fields.stopped_at);
    elements.tokenAccountIdInput.value = fields.account_id || fields.credentials?.chatgpt_account_id || '';
    if (elements.sub2ApiAccountIdInput) {
      elements.sub2ApiAccountIdInput.value = fields.credentials?.chatgpt_account_id || '';
    }
    elements.tokenClientIdInput.value = fields.client_id || '';
    elements.tokenAccessTokenInput.value = fields.access_token || '';
    elements.tokenRefreshTokenInput.value = fields.refresh_token || '';
    if (elements.tokenSub2ApiRuntimeIdInput) elements.tokenSub2ApiRuntimeIdInput.value = fields.credentials?.agent_runtime_id || '';
    if (elements.tokenSub2ApiUserIdInput) elements.tokenSub2ApiUserIdInput.value = fields.credentials?.chatgpt_user_id || '';
    if (elements.tokenSub2ApiTaskIdInput) elements.tokenSub2ApiTaskIdInput.value = fields.credentials?.task_id || '';
    if (elements.tokenSub2ApiPrivateKeyInput) elements.tokenSub2ApiPrivateKeyInput.value = fields.credentials?.agent_private_key || '';
    setSub2ApiFieldsVisible(state.accountModalSubtype === 'sub2api');
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

    if (state.accountModalSubtype === 'sub2api') {
      const credentials = {
        ...(state.accountModalCredentials || {}),
        auth_mode: 'agentIdentity',
        agent_runtime_id: elements.tokenSub2ApiRuntimeIdInput.value.trim(),
        agent_private_key: elements.tokenSub2ApiPrivateKeyInput.value.trim(),
        task_id: elements.tokenSub2ApiTaskIdInput.value.trim(),
        chatgpt_account_id: elements.sub2ApiAccountIdInput.value.trim(),
        chatgpt_user_id: elements.tokenSub2ApiUserIdInput.value.trim(),
        email: elements.tokenEmailInput.value.trim(),
      };
      for (const field of ['task_id', 'email']) {
        if (!credentials[field]) delete credentials[field];
      }
      for (const field of ['agent_runtime_id', 'agent_private_key', 'chatgpt_account_id', 'chatgpt_user_id']) {
        if (!credentials[field]) throw new Error(`${field} 必填`);
      }
      return {
        mode: state.editingAccountIndex !== null ? 'edit' : 'token',
        index: state.editingAccountIndex,
        type: 'token',
        subtype: 'sub2api',
        description: elements.tokenEmailInput.value.trim(),
        alias: elements.tokenAliasInput.value.trim(),
        price_yuan: readOptionalPrice(elements.tokenPriceInput),
        started_at: readDateTimeInput(elements.tokenStartedAtInput),
        stopped_at: readDateTimeInput(elements.tokenStoppedAtInput),
        credentials,
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

  function startAccountReorder() {
    if (state.reorderMode) return;
    state.reorderPreviousView = {
      filterType: state.filterType,
      sortBy: state.sortBy,
      sortDirection: state.sortDirection,
      searchQuery: elements.accountSearchInput.value,
    };
    state.reorderMode = true;
    state.reorderDraft = createReorderDraft(state.snapshot.accounts);
    state.filterType = 'all';
    state.sortBy = 'default';
    state.sortDirection = 'desc';
    elements.accountSearchInput.value = '';
    elements.accountSortSelect.value = 'default';
    elements.sortDirectionButton.textContent = '↓';
    renderAccounts();
  }

  function finishAccountReorder() {
    const previous = state.reorderPreviousView;
    state.reorderMode = false;
    state.reorderDraft = [];
    state.reorderPreviousView = null;
    state.reorderSaving = false;
    if (previous) {
      state.filterType = previous.filterType;
      state.sortBy = previous.sortBy;
      state.sortDirection = previous.sortDirection;
      elements.accountSearchInput.value = previous.searchQuery;
      elements.accountSortSelect.value = previous.sortBy;
      elements.sortDirectionButton.textContent = previous.sortDirection === 'desc' ? '↓' : '↑';
    }
  }

  function updateReorderDraft(orderedIndexes) {
    state.reorderDraft = [...orderedIndexes];
    elements.accountsGrid.querySelectorAll(':scope > [data-account-index]').forEach((card, position) => {
      const label = card.querySelector('.reorder-position');
      if (label) label.textContent = `第 ${position + 1} 位`;
    });
  }

  function moveAccountInReorder(accountIndex, offset) {
    const nextDraft = moveReorderIndex(state.reorderDraft, accountIndex, offset);
    if (nextDraft.every((index, position) => index === state.reorderDraft[position])) return;
    state.reorderDraft = nextDraft;
    renderAccounts();
    window.setTimeout(() => {
      elements.accountsGrid.querySelector(`[data-reorder-handle="${accountIndex}"]`)?.focus();
    }, 0);
  }

  function cancelAccountReorder() {
    finishAccountReorder();
    renderAccounts();
  }

  async function saveAccountReorder() {
    if (!state.reorderMode || state.reorderSaving) return;
    state.reorderSaving = true;
    renderAccounts();
    try {
      state.snapshot = normalizeSnapshot(await invoke('save_desktop_account_order', {
        orderedIndexes: state.reorderDraft,
      }));
      finishAccountReorder();
      renderAll();
      showToast('账号顺序已保存');
    } catch (error) {
      state.reorderSaving = false;
      renderAccounts();
      showToast(`顺序保存失败：${error.message || String(error)}`);
    }
  }

  async function activateAccount(index) {
    state.snapshot = normalizeSnapshot(await invoke('activate_desktop_account', { index }));
    renderAll();
  }

  async function refreshAccount(index) {
    state.snapshot = normalizeSnapshot(await invoke('refresh_desktop_account', { index }));
    renderAll();
    const refreshedAccount = findAccount(index);
    const refreshResult = getAccountRefreshResult(refreshedAccount);
    const successText = isApiKeyAccount(refreshedAccount) ? '上游检查完成' : '额度已更新';
    showToast(refreshResult.ok
      ? successText
      : `检查失败：${refreshResult.message || '未获得检查结果'}`);
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
    const account = findAccount(index);
    const accountName = account ? getDisplayName(account) : `账号 #${index + 1}`;
    const confirmed = await requestConfirmation({
      title: '恢复账号',
      message: '恢复后，该账号将重新显示在账号列表中。',
      subject: accountName,
      primaryText: '恢复',
      primaryValue: 'restore',
    });
    if (confirmed !== 'restore') return;
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
    const rawMessage = String(message || '').replace(/\s+/g, ' ').trim();
    const missingModule = rawMessage.match(/Cannot find module ['"]([^'"]+)['"]/i);
    const displayMessage = missingModule
      ? `服务依赖缺失：${missingModule[1]}`
      : rawMessage.length > 180
        ? `${rawMessage.slice(0, 177)}...`
        : rawMessage;
    elements.toast.textContent = displayMessage;
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
    elements.toggleBatchImportMenuButton.addEventListener('click', () => {
      setBatchImportMenuOpen(elements.batchImportMenu.hidden);
    });
    elements.openBatchImportButton.addEventListener('click', openBatchImportModal);
    elements.openBatchExportButton.addEventListener('click', () => {
      setBatchImportMenuOpen(false);
      batchExportController.open();
    });
    elements.emptyAddAccountButton.addEventListener('click', openAddAccountModal);
    elements.batchImportDropzone.addEventListener('click', () => elements.batchImportFileInput.click());
    elements.batchImportFileInput.addEventListener('change', () => {
      void readBatchImportFiles(elements.batchImportFileInput.files);
    });
    elements.batchImportExistingPolicy.addEventListener('change', renderBatchImportPreview);
    elements.batchImportReselectButton.addEventListener('click', () => {
      resetBatchImport();
      elements.batchImportFileInput.click();
    });
    elements.confirmBatchImportButton.addEventListener('click', () => void confirmBatchImport());
    for (const eventName of ['dragenter', 'dragover']) {
      elements.batchImportDropzone.addEventListener(eventName, event => {
        event.preventDefault();
        elements.batchImportDropzone.classList.add('dragging');
      });
    }
    for (const eventName of ['dragleave', 'drop']) {
      elements.batchImportDropzone.addEventListener(eventName, event => {
        event.preventDefault();
        elements.batchImportDropzone.classList.remove('dragging');
      });
    }
    elements.batchImportDropzone.addEventListener('drop', event => {
      void readBatchImportFiles(event.dataTransfer?.files);
    });
    elements.openAccountReorderButton.addEventListener('click', startAccountReorder);
    elements.cancelAccountReorderButton.addEventListener('click', cancelAccountReorder);
    elements.saveAccountReorderButton.addEventListener('click', () => void saveAccountReorder());
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
    elements.openTokenFormatButton?.addEventListener('click', () => {
      elements.tokenFormatDialog.hidden = false;
      showTokenFormat('session');
    });
    elements.closeTokenFormatButton?.addEventListener('click', () => {
      elements.tokenFormatDialog.hidden = true;
    });
    elements.tokenFormatButtons.forEach(button => {
      button.addEventListener('click', () => showTokenFormat(button.dataset.tokenFormat));
    });
    elements.accountForm.addEventListener('submit', saveAccount);
    elements.serviceToggleButton.addEventListener('click', toggleService);
    elements.settingsServicePortInput.addEventListener('change', saveSettings);
    elements.settingsProxyPortInput.addEventListener('change', saveSettings);
    elements.routingPreferenceSelect.addEventListener('change', saveSettings);
    elements.autoSwitchInput.addEventListener('change', saveSettings);
    elements.checkUpdateButton.addEventListener('click', handleUpdateButton);
    elements.availableUpdateButton.addEventListener('click', handleAvailableUpdateButton);
    elements.openTokenModalButton.addEventListener('click', () => openModal(elements.tokenModal));
    elements.tokenForm.addEventListener('submit', saveAccessToken);

    bindAccountReorder({
      grid: elements.accountsGrid,
      isEnabled: () => state.reorderMode && !state.reorderSaving,
      onOrderChange: updateReorderDraft,
      onKeyboardMove: moveAccountInReorder,
    });

    document.addEventListener('click', event => {
      if (!event.target.closest('#addAccountActions')) setBatchImportMenuOpen(false);

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

      const accountHelpButton = event.target.closest('[data-account-help-url]');
      if (accountHelpButton) {
        void openAccountHelpPage(accountHelpButton.dataset.accountHelpUrl);
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
        if (elements.tokenFormatDialog && !elements.tokenFormatDialog.hidden) {
          elements.tokenFormatDialog.hidden = true;
          return;
        }
        closeModalById('accountModal');
        closeModalById('batchImportModal');
        closeModalById('batchExportModal');
        closeModalById('tokenModal');
        setBatchImportMenuOpen(false);
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
    if (elements.authJsonDisplayPath) {
      elements.authJsonDisplayPath.textContent = getAuthJsonDisplayPath(window.navigator.userAgent);
    }
    bindEvents();
    setPage('accounts');
    await listenForTauriEvents();
    await loadAppVersion();
    await loadSnapshot();
    void checkForUpdates({ automatic: true });
    window.setInterval(() => loadSnapshot({ silent: true }), 30000);
  }

  initialize();
