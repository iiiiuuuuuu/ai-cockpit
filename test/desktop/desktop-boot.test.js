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
  return ['app.js', 'account-import.js', 'account-export.js', 'batch-import.js', 'batch-export.js', 'account-model.js', 'reorder.js', 'tauri-api.js', 'state.js', 'render.js', 'actions.js']
    .map(file => readDesktopFile(path.join('src', file)))
    .join('\n');
}

function readDesktopRust() {
  return ['main.rs', 'commands.rs', 'desktop_data.rs', 'runtime.rs', 'service.rs', 'shell.rs']
    .map(file => readDesktopFile(path.join('src-tauri', 'src', file)))
    .join('\n');
}

function readDesktopStyles() {
  return ['base.css', 'accounts.css', 'settings.css', 'dialogs.css', 'batch-import.css', 'batch-export.css', 'responsive.css', 'theme.css']
    .map(file => readDesktopFile(path.join('src', 'styles', file)))
    .join('\n');
}

function createFakeElement(overrides = {}) {
  const listeners = new Map();
  const classes = new Set();
  const attributes = new Map();
  return {
    checked: false,
    indeterminate: false,
    disabled: false,
    dataset: {},
    innerHTML: '',
    textContent: '',
    value: '',
    classList: {
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    dispatch(type, event = {}) {
      for (const handler of listeners.get(type) || []) {
        handler({ currentTarget: this, target: this, ...event });
      }
    },
    ...overrides,
  };
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
  assert.match(html, /class="add-account-split"[\s\S]*?class="add-account-button" type="button" id="openAddAccountModalButton"/);
  assert.match(html, /class="nav-icon chatgpt-nav-icon"/);
  assert.match(html, /src="\.\/src\/assets\/chatgpt-mark\.png"/);
  assert.ok(fs.existsSync(path.join(desktopDir, 'src', 'assets', 'chatgpt-mark.png')));
  assert.match(html, /class="nav-icon settings-nav-icon"/);
  assert.doesNotMatch(html, /M12 3\.4a4\.2 4\.2/);
  assert.doesNotMatch(html, /id="openSettingsButton"/);
});

test('empty account state uses one compact plus action', () => {
  const html = readDesktopFile('index.html');
  const script = readDesktopFile('src/app.js');
  const styles = readDesktopFile('src/styles/accounts.css');

  assert.doesNotMatch(html, /class="empty-icon"/);
  assert.match(
    html,
    /class="empty-add-button"[^>]*id="emptyAddAccountButton"[^>]*aria-label="添加账号"[^>]*>\+<\/button>/,
  );
  assert.match(styles, /\.empty-state\s*{[^}]*justify-self:\s*start;[^}]*width:\s*min\(100%,\s*360px\);[^}]*min-height:\s*220px;/s);
  assert.match(styles, /\.empty-title\s*{[^}]*color:\s*var\(--muted\);[^}]*font-size:\s*13px;[^}]*font-weight:\s*400;/s);
  assert.match(styles, /\.empty-add-button\s*{[^}]*width:\s*32px;[^}]*height:\s*32px;/s);
  assert.match(script, /const unfilteredCounts = getAccountFilterCounts\(sourceAccounts, ''\);/);
  assert.match(script, /const hasStoredAccounts = unfilteredCounts\.all > 0;/);
  assert.match(script, /addAccountActions\.hidden = reordering;/);
  assert.match(script, /emptyAccountsState\.hidden = hasAccounts \|\| hasStoredAccounts;/);
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

test('account export defaults to active accounts and filters searches and paginates rows', async () => {
  const exportUrl = pathToFileURL(path.join(desktopDir, 'src', 'account-export.js')).href;
  const accountExport = await import(exportUrl);
  const accounts = [
    { index: 0, item: { alias: 'Primary', description: 'first@example.com', account_id: 'acc-primary' } },
    { index: 1, item: { type: 'apikey', alias: 'Internal API', base_url: 'https://internal.example.com/v1' } },
    { index: 2, item: { alias: 'Removed', base_url: 'https://archive.example.com/v1', deleted_at: '2026-07-13T10:00:00Z' } },
    { index: 3, item: { type: 'apikey', alias: 'Removed API', deleted_at: '2026-07-14T10:00:00Z' } },
  ];
  const original = structuredClone(accounts);
  const rows = Array.from({ length: 23 }, (_, index) => ({ index }));
  const originalRows = structuredClone(rows);

  assert.deepEqual([...accountExport.createAccountExportSelection(accounts)], [0, 1]);
  assert.deepEqual(
    accountExport.filterAccountExportRows(accounts, { type: 'deleted', query: '  ARCHIVE.EXAMPLE.COM  ' })
      .map(account => account.index),
    [2],
  );
  assert.deepEqual(
    accountExport.filterAccountExportRows(accounts, { type: 'all', query: '' }).map(account => account.index),
    [0, 1, 2, 3],
  );
  assert.deepEqual(accountExport.paginateAccountExportRows(
    rows,
    99,
  ), {
    rows: [{ index: 20 }, { index: 21 }, { index: 22 }],
    total: 23,
    pageCount: 3,
    currentPage: 3,
    start: 20,
  });
  assert.deepEqual(accountExport.paginateAccountExportRows([], -4, 0), {
    rows: [],
    total: 0,
    pageCount: 1,
    currentPage: 1,
    start: 0,
  });
  assert.deepEqual(accounts, original);
  assert.deepEqual(rows, originalRows);
});

test('account export lists non-deleted accounts before deleted accounts', async () => {
  const exportUrl = pathToFileURL(path.join(desktopDir, 'src', 'account-export.js')).href;
  const { filterAccountExportRows } = await import(exportUrl);
  const accounts = [
    { index: 8, item: { alias: 'Deleted first', deleted_at: '2026-07-14T10:00:00Z' } },
    { index: 2, item: { alias: 'Active token' } },
    { index: 9, item: { alias: 'Deleted second', deleted_at: '2026-07-13T10:00:00Z' } },
    { index: 4, item: { type: 'apikey', alias: 'Active API' } },
  ];

  assert.deepEqual(
    filterAccountExportRows(accounts, { type: 'all', query: '' }).map(account => account.index),
    [2, 4, 8, 9],
  );
});

test('account export quick scopes select active all or no account indexes safely', async () => {
  const exportUrl = pathToFileURL(path.join(desktopDir, 'src', 'account-export.js')).href;
  const { selectAccountExportScope, filterAccountExportRows } = await import(exportUrl);
  const accounts = [
    { index: 4, item: { alias: 'Token' } },
    { index: 5, item: { type: 'apikey', alias: 'API' } },
    { index: 6, item: { alias: 'Deleted', deleted_at: '2026-07-14T10:00:00Z' } },
    { index: '7', item: { alias: 'Invalid index' } },
    { index: -1, item: { alias: 'Negative index' } },
    { item: { alias: 'Missing index' } },
    null,
  ];

  assert.deepEqual([...selectAccountExportScope(accounts, 'active')], [4, 5]);
  assert.deepEqual([...selectAccountExportScope(accounts, 'all')], [4, 5, 6]);
  assert.deepEqual([...selectAccountExportScope(accounts, 'none')], []);
  assert.deepEqual([...selectAccountExportScope(null, 'unknown')], []);
  assert.deepEqual(filterAccountExportRows(accounts, { type: 'token', query: null }).map(account => account.index), [4]);
  assert.deepEqual(filterAccountExportRows(accounts, { type: 'apikey', query: '' }).map(account => account.index), [5]);
  assert.deepEqual(filterAccountExportRows(null, null), []);
});

test('batch account export UI exposes menu modal selection table and fixed footer actions', () => {
  const html = readDesktopFile('index.html');
  const script = readDesktopScripts();
  const appScript = readDesktopFile('src/app.js');
  const styles = readDesktopStyles();
  const exportStyles = readDesktopFile('src/styles/batch-export.css');

  assert.match(html, /id="openBatchExportButton"[^>]*>[\s\S]*?<span>批量导出账号<\/span><\/button>/);
  assert.match(html, /id="batchExportModal"/);
  assert.match(html, /id="batchExportTitle"[^>]*>批量导出账号</);
  assert.match(html, /选择需要迁移到其他电脑的账号。/);
  assert.match(html, /id="batchExportSearchInput"[^>]*placeholder="搜索别名、邮箱、Account ID 或 Base URL"/);
  for (const filter of ['all', 'token', 'apikey', 'deleted']) {
    assert.match(html, new RegExp(`data-batch-export-filter="${filter}"`));
    assert.match(html, new RegExp(`data-batch-export-count="${filter}"`));
  }
  assert.match(html, /data-batch-export-scope="active"[^>]*>选择全部未删除</);
  assert.match(html, /data-batch-export-scope="all"[^>]*>选择全部账号</);
  assert.match(html, /data-batch-export-scope="none"[^>]*>清空选择</);
  assert.match(html, /id="batchExportSelectionSummary"[^>]*>未选择账号</);
  assert.match(html, /id="batchExportPageCheckbox"/);
  assert.match(html, /id="batchExportTableBody"/);
  assert.match(html, /id="batchExportPagination"/);
  assert.match(html, /导出文件包含完整 Token 和 API Key，请妥善保管。/);
  assert.match(html, /class="dialog-button"[^>]*data-close-modal="batchExportModal"[^>]*>取消</);
  assert.match(html, /id="confirmBatchExportButton"[^>]*disabled[^>]*>导出 0 个账号</);
  assert.match(script, /createBatchExportController/);
  assert.match(script, /export_desktop_accounts/);
  assert.doesNotMatch(appScript, /renderBatchExport/);
  assert.match(styles, /\.batch-export-modal\s*\{[^}]*width:\s*min\(900px,/s);
  assert.match(styles, /\.batch-export-table-scroll\s*\{[^}]*overflow:\s*auto;/s);
  assert.match(styles, /\.batch-export-search input:focus-visible[\s\S]*outline:\s*none;[\s\S]*box-shadow:\s*none;/);
  assert.doesNotMatch(exportStyles, /font-size:\s*9px/);
  assert.match(exportStyles, /\.batch-export-quick-actions button\s*{[^}]*font-size:\s*11px;/s);
});

test('batch account export controller keeps selection across pages and supports quick scopes', async () => {
  const exportUrl = pathToFileURL(path.join(desktopDir, 'src', 'batch-export.js')).href;
  const { createBatchExportController } = await import(exportUrl);
  const accounts = Array.from({ length: 13 }, (_, index) => ({
    index,
    item: {
      type: index % 3 === 0 ? 'apikey' : 'token',
      alias: `Account ${index}`,
      deleted_at: index === 12 ? '2026-07-14T10:00:00Z' : '',
    },
  }));
  const selectionSummary = createFakeElement();
  const controller = createBatchExportController({
    accounts,
    pageSize: 10,
    elements: { selectionSummary },
  });

  controller.open();
  assert.equal(controller.getState().selectedCount, 12);
  assert.equal(selectionSummary.textContent, '已选择 12 个未删除账号');
  assert.equal(controller.getState().pageRows.length, 10);
  controller.setPage(2);
  assert.deepEqual(controller.getState().pageRows.map(account => account.index), [10, 11, 12]);
  controller.toggleIndex(10, false);
  assert.equal(controller.getState().selectedCount, 11);
  controller.setPage(1);
  assert.equal(controller.getState().selected.has(10), false);

  controller.selectScope('all');
  assert.equal(controller.getState().selectedCount, 13);
  assert.equal(controller.getState().selected.has(12), true);
  assert.equal(selectionSummary.textContent, '已选择 13 个账号（含 1 个已删除）');
  controller.selectScope('none');
  assert.equal(controller.getState().selectedCount, 0);
  assert.equal(controller.getState().canExport, false);
  assert.equal(selectionSummary.textContent, '未选择账号');
});

test('batch account export page selection follows registered DOM change handlers', async () => {
  const exportUrl = pathToFileURL(path.join(desktopDir, 'src', 'batch-export.js')).href;
  const { createBatchExportController } = await import(exportUrl);
  const pageCheckbox = createFakeElement();
  const tableBody = createFakeElement();
  const accounts = Array.from({ length: 13 }, (_, index) => ({
    index,
    item: {
      alias: `Account ${index}`,
      deleted_at: index === 12 ? '2026-07-14T10:00:00Z' : '',
    },
  }));
  const controller = createBatchExportController({
    accounts,
    pageSize: 10,
    elements: { pageCheckbox, tableBody },
  });

  controller.open();
  assert.equal(pageCheckbox.checked, true);
  assert.equal(pageCheckbox.indeterminate, false);

  const rowCheckbox = createFakeElement({
    checked: false,
    dataset: { batchExportIndex: '4' },
  });
  rowCheckbox.closest = selector => selector === '[data-batch-export-index]' ? rowCheckbox : null;
  tableBody.dispatch('change', { target: rowCheckbox });
  assert.equal(pageCheckbox.checked, false);
  assert.equal(pageCheckbox.indeterminate, true);

  pageCheckbox.checked = false;
  pageCheckbox.dispatch('change');
  const deselectedState = controller.getState();
  assert.equal(pageCheckbox.checked, false);
  assert.equal(pageCheckbox.indeterminate, false);
  assert.equal(deselectedState.selectedCount, 2);
  assert.deepEqual([...deselectedState.selected], [10, 11]);

  pageCheckbox.checked = true;
  pageCheckbox.dispatch('change');
  const restoredState = controller.getState();
  assert.equal(pageCheckbox.checked, true);
  assert.equal(pageCheckbox.indeterminate, false);
  assert.equal(restoredState.selectedCount, 12);
  assert.deepEqual([...restoredState.selected], [10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('batch account export controller invokes desktop export and preserves modal on save cancellation', async () => {
  const exportUrl = pathToFileURL(path.join(desktopDir, 'src', 'batch-export.js')).href;
  const { createBatchExportController } = await import(exportUrl);
  const calls = [];
  const closed = [];
  const toasts = [];
  const accounts = [
    { index: 2, item: { alias: 'Primary' } },
    { index: 7, item: { type: 'apikey', alias: 'API' } },
  ];
  let response = { saved: false, exported: 0 };
  const controller = createBatchExportController({
    accounts,
    now: () => new Date('2026-07-14T10:20:30Z'),
    invoke: async (command, args) => {
      calls.push({ command, args });
      return response;
    },
    close: () => closed.push(true),
    showToast: message => toasts.push(message),
  });

  controller.open();
  await controller.exportSelected();
  assert.equal(calls[0].command, 'export_desktop_accounts');
  assert.deepEqual(calls[0].args.indexes, [2, 7]);
  assert.equal(calls[0].args.exportedAt, '2026-07-14T10:20:30.000Z');
  assert.match(calls[0].args.suggestedFilename, /^ai-cockpit-accounts-20260714-102030\.json$/);
  assert.equal(closed.length, 0);
  assert.equal(toasts.length, 0);

  response = { saved: true, exported: 2 };
  await controller.exportSelected();
  assert.equal(closed.length, 1);
  assert.deepEqual(toasts, ['已导出 2 个账号']);
});

test('batch account export keeps its concurrency lock when the modal is reopened', async () => {
  const exportUrl = pathToFileURL(path.join(desktopDir, 'src', 'batch-export.js')).href;
  const { createBatchExportController } = await import(exportUrl);
  const modal = createFakeElement({ hidden: true });
  const confirmButton = createFakeElement();
  const calls = [];
  let resolveExport;
  const exportResult = new Promise(resolve => {
    resolveExport = resolve;
  });
  const controller = createBatchExportController({
    accounts: [{ index: 3, item: { alias: 'Primary' } }],
    elements: { modal, confirmButton },
    invoke: async (command, args) => {
      calls.push({ command, args });
      return exportResult;
    },
  });

  controller.open();
  const pendingExport = controller.exportSelected();
  modal.hidden = true;
  controller.open();
  const duplicateExport = controller.exportSelected();

  assert.equal(calls.length, 1);
  assert.equal(controller.getState().exporting, true);
  assert.equal(controller.getState().canExport, false);
  assert.equal(confirmButton.disabled, true);
  assert.equal(confirmButton.textContent, '正在导出…');

  resolveExport({ saved: true, exported: 1 });
  const [, duplicateResult] = await Promise.all([pendingExport, duplicateExport]);
  assert.equal(duplicateResult, null);
  assert.equal(controller.getState().exporting, false);
  assert.equal(controller.getState().canExport, true);
});

test('batch account export reports errors without closing and allows retry', async () => {
  const exportUrl = pathToFileURL(path.join(desktopDir, 'src', 'batch-export.js')).href;
  const { createBatchExportController } = await import(exportUrl);
  const confirmButton = createFakeElement();
  const closed = [];
  const toasts = [];
  let attempts = 0;
  const controller = createBatchExportController({
    accounts: [{ index: 5, item: { alias: 'Primary' } }],
    elements: { confirmButton },
    close: () => closed.push(true),
    showToast: message => toasts.push(message),
    invoke: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('  磁盘不可写  ');
      return { saved: false, exported: 0 };
    },
  });

  controller.open();
  await controller.exportSelected();
  assert.equal(closed.length, 0);
  assert.deepEqual(toasts, ['批量导出失败：磁盘不可写']);
  assert.equal(controller.getState().exporting, false);
  assert.equal(controller.getState().canExport, true);
  assert.equal(confirmButton.disabled, false);
  assert.equal(confirmButton.textContent, '导出 1 个账号');

  await controller.exportSelected();
  assert.equal(attempts, 2);
  assert.equal(closed.length, 0);
  assert.equal(toasts.length, 1);
});

test('deleted account view sorts newest deletions first regardless of quota sorting', async () => {
  const accountModelUrl = pathToFileURL(path.join(desktopDir, 'src', 'account-model.js')).href;
  const { sortAccounts } = await import(accountModelUrl);
  const accounts = [
    { index: 0, item: { deleted_at: '2026-07-03T09:04:00' }, runtime: { primary_remaining_percent: 10 } },
    { index: 1, item: { deleted_at: '2026-07-14T10:45:00' }, runtime: { primary_remaining_percent: 90 } },
    { index: 2, item: { deleted_at: '2026-07-04T21:57:00' }, runtime: { primary_remaining_percent: 50 } },
  ];

  const sorted = sortAccounts(accounts, {
    filterType: 'deleted',
    sortBy: 'primaryQuota',
    sortDirection: 'asc',
  });

  assert.deepEqual(sorted.map(account => account.index), [1, 2, 0]);
});

test('current account stays first when normal account sorting changes direction', async () => {
  const accountModelUrl = pathToFileURL(path.join(desktopDir, 'src', 'account-model.js')).href;
  const { sortAccounts } = await import(accountModelUrl);
  const accounts = [
    { index: 0, item: { sort_order: 10 }, runtime: { primary_remaining_percent: 20 } },
    { index: 1, is_active: true, item: { sort_order: 20 }, runtime: { primary_remaining_percent: 50 } },
    { index: 2, item: { sort_order: 30 }, runtime: { primary_remaining_percent: 80 } },
  ];

  assert.deepEqual(sortAccounts(accounts, {
    filterType: 'all',
    sortBy: 'default',
    sortDirection: 'asc',
  }).map(account => account.index), [1, 2, 0]);
  assert.deepEqual(sortAccounts(accounts, {
    filterType: 'all',
    sortBy: 'primaryQuota',
    sortDirection: 'asc',
  }).map(account => account.index), [1, 0, 2]);
  assert.deepEqual(sortAccounts(accounts, {
    filterType: 'all',
    sortBy: 'primaryQuota',
    sortDirection: 'desc',
  }).map(account => account.index), [1, 2, 0]);
});

test('account reorder draft excludes deleted accounts and supports keyboard moves', async () => {
  const reorderUrl = pathToFileURL(path.join(desktopDir, 'src', 'reorder.js')).href;
  const reorder = await import(reorderUrl);
  const accounts = [
    { index: 0, item: { sort_order: 30 } },
    { index: 1, item: { sort_order: 10 } },
    { index: 2, item: { sort_order: 20, deleted_at: '2026-07-14T10:45:00' } },
  ];

  assert.deepEqual(reorder.createReorderDraft(accounts), [1, 0]);
  assert.deepEqual(reorder.moveReorderIndex([1, 0], 0, -1), [0, 1]);
  assert.deepEqual(reorder.moveReorderIndex([1, 0], 0, 1), [1, 0]);
  assert.deepEqual(
    reorder.orderAccountsByDraft(accounts.filter(account => account.index !== 2), [0, 1]).map(account => account.index),
    [0, 1],
  );
});

test('account reorder uses pointer-driven full-card dragging with stable drop placement', async () => {
  const reorderUrl = pathToFileURL(path.join(desktopDir, 'src', 'reorder.js')).href;
  const reorder = await import(reorderUrl);
  const script = readDesktopFile('src/reorder.js');
  const html = readDesktopFile('index.html');
  const styles = readDesktopFile('src/styles/accounts.css');

  const rect = { left: 100, top: 200, width: 300, height: 240 };
  assert.equal(reorder.shouldInsertAfter(rect, 180, 250), false);
  assert.equal(reorder.shouldInsertAfter(rect, 330, 315), true);
  assert.equal(reorder.shouldInsertAfter(rect, 180, 405), true);

  assert.match(script, /addEventListener\('pointerdown'/);
  assert.match(script, /addEventListener\('pointermove'/);
  assert.match(script, /addEventListener\('pointerup'/);
  assert.match(script, /setPointerCapture/);
  assert.match(script, /reorder-placeholder/);
  assert.doesNotMatch(script, /addEventListener\('dragstart'/);
  assert.doesNotMatch(script, /dataTransfer/);
  assert.doesNotMatch(html, /draggable="true"/);
  assert.match(html, /data-icon="reorder-list"/);
  assert.match(styles, /\.account-card\.reorder-floating/);
  assert.match(styles, /\.reorder-placeholder/);
});

test('accounts page exposes an explicit reorder mode and desktop save command', () => {
  const html = readDesktopFile('index.html');
  const script = readDesktopScripts();
  const rust = readDesktopRust();

  assert.match(html, /id="openAccountReorderButton"[^>]*aria-label="调整默认顺序"/);
  assert.match(html, /id="accountReorderActions"[^>]*hidden/);
  assert.match(html, /id="cancelAccountReorderButton"[^>]*>取消</);
  assert.match(html, /id="saveAccountReorderButton"[^>]*>完成</);
  assert.match(script, /save_desktop_account_order/);
  assert.match(script, /createReorderDraft/);
  assert.match(script, /data-reorder-handle/);
  assert.match(script, /orderedIndexes: state\.reorderDraft/);
  assert.match(rust, /pub\(crate\) async fn save_desktop_account_order/);
  assert.match(rust, /"\/admin\/api\/configs\/order"/);
  assert.match(rust, /save_desktop_account_order,/);
  assert.match(rust, /restore_desktop_account_at_end/);
  assert.match(readDesktopFile('../app/admin/admin-api.js'), /hasOwnProperty\.call\(body, 'sort_order'\)/);
});

test('deleted account metadata uses compact dates and restore confirmation', async () => {
  const accountModelUrl = pathToFileURL(path.join(desktopDir, 'src', 'account-model.js')).href;
  const accountModel = await import(accountModelUrl);
  const script = readDesktopFile('src/app.js');

  assert.equal(typeof accountModel.formatDeletedAt, 'function');
  assert.equal(accountModel.formatDeletedAt('2026-07-14T10:45:00'), '2026-07-14 10:45');
  assert.equal(accountModel.formatDeletedAt(''), '');
  assert.match(script, /`删除时间：\$\{formatDeletedAt\(item\.deleted_at\) \|\| '未知'\}`/);
  assert.match(script, /async function restoreAccount[\s\S]*?title: '恢复账号'[\s\S]*?primaryText: '恢复'[\s\S]*?if \(confirmed !== 'restore'\) return;/);
  assert.match(script, /const deletedView = state\.filterType === 'deleted';[\s\S]*?const sortingLocked = deletedView \|\| reordering;[\s\S]*?accountSortSelect\.disabled = sortingLocked;[\s\S]*?sortDirectionButton\.disabled = sortingLocked;/);
});

test('manual account refresh reports results without adding a third footer row', async () => {
  const accountModelUrl = pathToFileURL(path.join(desktopDir, 'src', 'account-model.js')).href;
  const accountModel = await import(accountModelUrl);
  const script = readDesktopFile('src/app.js');

  assert.equal(typeof accountModel.getAccountRefreshResult, 'function');
  assert.deepEqual(accountModel.getAccountRefreshResult({
    item: { deleted_at: '2026-07-14T10:45:00' },
    runtime: { last_checked_at: Date.now(), reason: 'deleted', last_error: 'quota check status 401' },
  }), {
    checked: true,
    ok: false,
    message: '鉴权失败 401，请重新登录或更新 Token',
  });
  assert.deepEqual(accountModel.getAccountRefreshResult({
    item: { deleted_at: '2026-07-14T10:45:00' },
    runtime: { last_checked_at: Date.now(), reason: 'rate_limit_not_allowed', primary_remaining_percent: 0 },
  }), {
    checked: true,
    ok: true,
    message: '检查成功',
  });
  assert.deepEqual(accountModel.getAccountRefreshResult({
    item: { deleted_at: '2026-07-14T10:45:00' },
    runtime: { reason: 'deleted' },
  }), {
    checked: false,
    ok: false,
    message: '',
  });

  assert.match(script, /const refreshResult = getAccountRefreshResult\(normalized\);/);
  assert.match(script, /最后检查：\$\{escapeHtml\(formatLastChecked\(normalized\)\)\}\$\{deletedCheckResult\}/);
  assert.match(script, /showToast\(refreshResult\.ok[\s\S]*?`检查失败：\$\{/);
  assert.doesNotMatch(script, /<div>检查结果：/);
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

test('account sort focus uses its own border without an outer ring', () => {
  const styles = readDesktopFile('src/styles/base.css');

  assert.match(styles, /#accountSortSelect:focus-visible\s*{[^}]*border-color:\s*rgba\(0,\s*102,\s*204,\s*0\.52\);[^}]*outline:\s*none;[^}]*box-shadow:\s*none;/s);
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
  assert.match(html, /解析后自动填充/);
  assert.match(html, /用于向 ChatGPT \/ Codex 发起请求。/);
  assert.doesNotMatch(html, /class="field required"/);

  assert.doesNotMatch(html, /支持能力/);
  assert.doesNotMatch(html, /Claude/);
});

test('account import accepts ChatGPT AuthSession and nested ChatGPT app auth json', async () => {
  const importUrl = pathToFileURL(path.join(desktopDir, 'src', 'account-import.js')).href;
  const accountImport = await import(importUrl);

  assert.deepEqual(accountImport.parseTokenJsonObject({
    user: { email: 'session@example.com' },
    account: { id: 'session-account' },
    accessToken: 'session-access',
    refreshToken: 'session-refresh',
  }, { startedAt: '2026-07-14T12:32' }), {
    description: 'session@example.com',
    alias: '',
    price_yuan: '',
    started_at: '2026-07-14T12:32',
    stopped_at: '',
    account_id: 'session-account',
    client_id: '',
    access_token: 'session-access',
    refresh_token: 'session-refresh',
  });

  assert.deepEqual(accountImport.parseTokenJsonObject({
    tokens: {
      access_token: 'app-access',
      refresh_token: 'app-refresh',
      account_id: 'app-account',
      client_id: 'app-client',
    },
  }), {
    description: '',
    alias: '',
    price_yuan: '',
    started_at: '',
    stopped_at: '',
    account_id: 'app-account',
    client_id: 'app-client',
    access_token: 'app-access',
    refresh_token: 'app-refresh',
  });

  assert.equal(accountImport.getAuthJsonDisplayPath('Mozilla/5.0 (Macintosh)'), '~/.codex/auth.json');
  assert.equal(accountImport.getAuthJsonDisplayPath('Mozilla/5.0 (Windows NT 10.0)'), '%USERPROFILE%\\.codex\\auth.json');
});

test('batch account import expands files and account collections into normalized records', async () => {
  const importUrl = pathToFileURL(path.join(desktopDir, 'src', 'batch-import.js')).href;
  const batchImport = await import(importUrl);
  const records = batchImport.parseBatchAccountSources([
    {
      name: 'single.json',
      content: JSON.stringify({
        user: { email: 'single@example.com' },
        account: { id: 'acc-single' },
        accessToken: 'single-access',
        refreshToken: 'single-refresh',
      }),
    },
    {
      name: 'accounts.json',
      content: JSON.stringify({
        accounts: [
          {
            type: 'apikey',
            alias: 'Compatible service',
            base_url: 'https://api.example.com/v1/',
            apikey: 'sk-example',
          },
          { email: 'invalid@example.com' },
        ],
      }),
    },
  ], { startedAt: '2026-07-14T16:30' });

  assert.equal(records.length, 3);
  assert.deepEqual(records[0].account, {
    mode: 'token',
    description: 'single@example.com',
    alias: '',
    price_yuan: '',
    started_at: '2026-07-14T16:30',
    stopped_at: '',
    account_id: 'acc-single',
    client_id: '',
    access_token: 'single-access',
    refresh_token: 'single-refresh',
  });
  assert.equal(records[1].account.mode, 'apikey');
  assert.equal(records[1].account.base_url, 'https://api.example.com/v1');
  assert.equal(records[1].account.apikey, 'sk-example');
  assert.equal(records[2].account, null);
  assert.match(records[2].error, /access_token/);
});

test('batch import preserves exported account lifecycle fields and order', async () => {
  const importUrl = pathToFileURL(path.join(desktopDir, 'src', 'batch-import.js')).href;
  const batchImport = await import(importUrl);
  const records = batchImport.parseBatchAccountSources([{
    name: 'ai-cockpit-export.json',
    content: JSON.stringify({
      format: 'ai-cockpit-account-export',
      version: 1,
      exported_at: '2026-07-14T17:00:00Z',
      accounts: [
        {
          description: 'first@example.com',
          account_id: 'acc-first',
          access_token: 'first-access',
          deletedAt: '2026-07-01T10:00:00Z',
          autoSwitchDisabled: true,
        },
        {
          type: 'apikey',
          alias: 'Second API',
          base_url: 'https://api.example.com/v1',
          apikey: 'sk-second',
          deleted_at: '2026-07-02T10:00:00Z',
          auto_switch_disabled: 'true',
        },
        {
          account_id: 'acc-third',
          access_token: 'third-access',
          auto_switch_disabled: false,
        },
      ],
    }),
  }]);

  assert.deepEqual(records.map(record => record.account.account_id || record.account.alias), [
    'acc-first',
    'Second API',
    'acc-third',
  ]);
  assert.equal(records[0].account.deleted_at, '2026-07-01T10:00:00Z');
  assert.equal(records[0].account.auto_switch_disabled, true);
  assert.equal(records[1].account.deleted_at, '2026-07-02T10:00:00Z');
  assert.equal('auto_switch_disabled' in records[1].account, false);
  assert.equal('auto_switch_disabled' in records[2].account, false);

  const selected = batchImport.selectBatchImportAccounts(
    batchImport.classifyBatchImportRecords(records, []),
    false,
  );
  assert.deepEqual(selected.map(account => account.account_id || account.alias), [
    'acc-first',
    'Second API',
    'acc-third',
  ]);
  assert.equal(selected[0].deleted_at, '2026-07-01T10:00:00Z');
  assert.equal(selected[0].auto_switch_disabled, true);
  assert.equal(selected[1].deleted_at, '2026-07-02T10:00:00Z');
});

test('batch import rejects unsupported export envelopes without stopping later sources', async () => {
  const importUrl = pathToFileURL(path.join(desktopDir, 'src', 'batch-import.js')).href;
  const batchImport = await import(importUrl);
  const exportEnvelope = version => JSON.stringify({
    format: 'ai-cockpit-account-export',
    ...(version === undefined ? {} : { version }),
    accounts: [],
  });
  const records = batchImport.parseBatchAccountSources([
    { name: 'unknown.json', content: exportEnvelope(2) },
    { name: 'missing.json', content: exportEnvelope(undefined) },
    { name: 'string.json', content: exportEnvelope('1') },
    {
      name: 'later.json',
      content: JSON.stringify({ account_id: 'acc-later', access_token: 'later-access' }),
    },
  ]);

  assert.equal(records.length, 4);
  assert.deepEqual(records.slice(0, 3).map(record => record.account), [null, null, null]);
  records.slice(0, 3).forEach(record => {
    assert.equal(record.error, '暂不支持此 AI Cockpit 导出文件版本');
  });
  assert.equal(records[3].account.account_id, 'acc-later');
});

test('batch import rejects export envelopes whose accounts field is not an array', async () => {
  const importUrl = pathToFileURL(path.join(desktopDir, 'src', 'batch-import.js')).href;
  const batchImport = await import(importUrl);
  const records = batchImport.parseBatchAccountSources([{
    name: 'invalid-accounts.json',
    content: JSON.stringify({
      format: 'ai-cockpit-account-export',
      version: 1,
      accounts: {},
    }),
  }]);

  assert.equal(records.length, 1);
  assert.equal(records[0].account, null);
  assert.match(records[0].error, /accounts.*数组/);
});

test('batch account import classifies existing changed suspected deleted and new accounts', async () => {
  const importUrl = pathToFileURL(path.join(desktopDir, 'src', 'batch-import.js')).href;
  const batchImport = await import(importUrl);
  const existingAccounts = [
    { index: 0, item: { description: 'existing@example.com', account_id: 'acc-existing', access_token: 'old-access', refresh_token: 'old-refresh' } },
    { index: 1, item: { description: 'deleted@example.com', account_id: 'acc-deleted', access_token: 'deleted-access', deleted_at: '2026-07-01T10:00:00' } },
    { index: 2, item: { type: 'apikey', base_url: 'https://api.example.com/v1', apikey: 'sk-existing' } },
    { index: 3, item: { description: 'changed@example.com', account_id: 'acc-changed', access_token: 'old-changed-access', refresh_token: 'old-changed-refresh' } },
  ];
  const records = [
    { id: 'same', source: 'same.json', account: { mode: 'token', description: 'existing@example.com', account_id: 'acc-existing', access_token: 'old-access', refresh_token: 'old-refresh' }, error: '' },
    { id: 'changed', source: 'changed.json', account: { mode: 'token', description: 'changed@example.com', account_id: 'acc-changed', access_token: 'new-access', refresh_token: 'new-refresh' }, error: '' },
    { id: 'suspected', source: 'suspected.json', account: { mode: 'token', description: 'existing@example.com', account_id: '', access_token: 'other-access', refresh_token: '' }, error: '' },
    { id: 'deleted', source: 'deleted.json', account: { mode: 'token', description: 'deleted@example.com', account_id: 'acc-deleted', access_token: 'new-deleted-access', refresh_token: '' }, error: '' },
    { id: 'api', source: 'api.json', account: { mode: 'apikey', description: 'API', alias: '', base_url: 'https://api.example.com/v1/', apikey: 'sk-existing' }, error: '' },
    { id: 'new', source: 'new.json', account: { mode: 'token', description: 'new@example.com', account_id: 'acc-new', access_token: 'new-access', refresh_token: '' }, error: '' },
    { id: 'invalid', source: 'invalid.json', account: null, error: '缺少 access_token' },
  ];

  const preview = batchImport.classifyBatchImportRecords(records, existingAccounts);
  assert.deepEqual(preview.map(record => record.status), [
    'existing',
    'credential_changed',
    'suspected_duplicate',
    'deleted',
    'existing',
    'new',
    'invalid',
  ]);
  assert.deepEqual(batchImport.selectBatchImportAccounts(preview, false).map(item => item.account_id), ['acc-new']);
  assert.deepEqual(
    batchImport.selectBatchImportAccounts(preview, true).map(item => [item.account_id, item.existing_index ?? null]),
    [['acc-changed', 3], ['acc-new', null]],
  );
  assert.deepEqual(batchImport.getBatchImportSummary(preview), {
    total: 7,
    new: 1,
    existing: 2,
    credential_changed: 1,
    suspected_duplicate: 1,
    batch_duplicate: 0,
    deleted: 1,
    invalid: 1,
  });
});

test('batch account import keeps only the first strong identity in one batch', async () => {
  const importUrl = pathToFileURL(path.join(desktopDir, 'src', 'batch-import.js')).href;
  const batchImport = await import(importUrl);
  const records = [
    { id: 'first', source: 'first.json', account: { mode: 'token', account_id: 'acc-same', access_token: 'first-access' }, error: '' },
    { id: 'second', source: 'second.json', account: { mode: 'token', account_id: 'acc-same', access_token: 'second-access' }, error: '' },
  ];

  const preview = batchImport.classifyBatchImportRecords(records, []);

  assert.deepEqual(preview.map(record => record.status), ['new', 'batch_duplicate']);
  assert.deepEqual(batchImport.selectBatchImportAccounts(preview, true).map(item => item.access_token), ['first-access']);
});

test('batch account import does not merge different account ids that share one token subject', async () => {
  const importUrl = pathToFileURL(path.join(desktopDir, 'src', 'batch-import.js')).href;
  const batchImport = await import(importUrl);
  const sharedPayload = Buffer.from(JSON.stringify({ sub: 'shared-user' })).toString('base64url');
  const existingAccounts = [{
    index: 0,
    item: { account_id: 'workspace-one', access_token: `x.${sharedPayload}.x` },
  }];
  const records = [{
    id: 'workspace-two',
    source: 'workspace-two.json',
    account: { mode: 'token', account_id: 'workspace-two', access_token: `x.${sharedPayload}.x` },
    error: '',
  }];

  const preview = batchImport.classifyBatchImportRecords(records, existingAccounts);

  assert.equal(preview[0].status, 'new');
});

test('batch import UI exposes a split add action and three import stages', () => {
  const html = readDesktopFile('index.html');
  const script = readDesktopScripts();
  const styles = readDesktopStyles();

  assert.match(html, /class="add-account-split"/);
  assert.match(html, /id="openAddAccountModalButton"[^>]*>\s*添加账号\s*<\/button>/);
  assert.match(html, /id="toggleBatchImportMenuButton"/);
  assert.match(html, /id="openBatchImportButton"[^>]*>[\s\S]*?<span>批量导入账号<\/span><\/button>/);
  assert.match(html, /id="batchImportModal"/);
  assert.match(html, /id="batchImportFileInput"[^>]*multiple/);
  assert.match(html, /data-batch-import-panel="files"/);
  assert.match(html, /data-batch-import-panel="preview"/);
  assert.match(html, /data-batch-import-panel="result"/);
  assert.match(script, /parseBatchAccountSources/);
  assert.match(script, /import_desktop_accounts/);
  assert.match(styles, /\.add-account-split/);
  assert.match(styles, /\.add-account-menu\s*\{[\s\S]*?width:\s*140px/);
  assert.match(styles, /\.batch-import-preview-head select:focus-visible\s*\{[^}]*border-color:\s*rgba\(0,\s*102,\s*204,\s*0\.52\);[^}]*outline:\s*none;[^}]*box-shadow:\s*none;/s);
  assert.match(styles, /\.batch-import-dropzone/);
  assert.match(styles, /height:\s*32px/);
  assert.match(readDesktopFile('src-tauri/tauri.conf.json'), /"dragDropEnabled": false/);
});

test('batch import writes once and reloads the running service through a compliant config URL', () => {
  const rust = readDesktopRust();
  const adminApi = readDesktopFile('../app/admin/admin-api.js');

  assert.match(rust, /fn import_desktop_accounts/);
  assert.match(rust, /apply_desktop_batch_import/);
  assert.match(rust, /"\/admin\/api\/config\/reload"/);
  assert.match(adminApi, /router\.post\('\/config\/reload'/);
  assert.match(adminApi, /persistAndReloadConfig\(parsed, 'admin_batch_import'/);
  assert.match(adminApi, /void refreshConfigAdminResponse\(\)\.catch/);
  assert.doesNotMatch(adminApi, /router\.post\('\/configs\/import'/);
});

test('add account form follows the approved grouped product layout', () => {
  const html = readDesktopFile('index.html');
  const script = readDesktopScripts();
  const styles = readDesktopFile('src/styles/dialogs.css');

  assert.match(html, /导入 ChatGPT\/Codex 登录信息，并确认账号资料。/);
  assert.match(html, /class="account-import-sources"/);
  assert.match(html, /class="account-import-source-line"><strong>方式一：<\/strong>使用无痕窗口打开/);
  assert.match(html, /class="account-import-source-line"><strong>方式二：<\/strong>登录 ChatGPT\/Codex 应用后/);
  assert.match(html, /data-account-help-url="https:\/\/chatgpt\.com\/"/);
  assert.match(html, /data-account-help-url="https:\/\/chatgpt\.com\/api\/auth\/session"/);
  assert.match(html, /id="authJsonDisplayPath"/);
  assert.match(html, /id="parseTokenJsonButton"[^>]*>解析 JSON<\/button>[\s\S]*?id="tokenJsonInput"/);
  assert.match(html, /id="openTokenFormatButton"/);
  assert.match(html, /id="tokenFormatDialog"/);
  assert.match(html, /data-token-format="session"/);
  assert.match(html, /data-token-format="app"/);
  assert.match(html, /class="account-section-title">账号标识/);
  assert.match(html, /连接兼容 OpenAI API 格式的服务/);
  assert.match(html, /填写服务商提供的接口地址，通常以 \/v1 结尾。/);
  assert.match(html, /填写服务商提供的 API Key，仅保存在本机。/);
  assert.match(html, /data-add-only[\s\S]*?id="tokenJsonInput"[^>]*data-modal-autofocus/);
  assert.match(html, /data-edit-only[^>]*hidden[\s\S]*?id="tokenStoppedAtInput"/);
  assert.match(html, /data-edit-only[^>]*hidden[\s\S]*?id="apiKeyStoppedAtInput"/);
  assert.doesNotMatch(html, /Token 信息辅助填充/);
  assert.doesNotMatch(html, /方式二：Codex auth\.json/);
  assert.doesNotMatch(html, /高级设置/);
  assert.match(script, /getAuthJsonDisplayPath/);
  assert.match(script, /配置服务商提供的接口地址与 API Key，并完善账号资料。/);
  assert.match(script, /open_account_help_page/);
  assert.match(script, /setEditOnlyFieldsVisible/);
  assert.match(script, /setAddOnlyFieldsVisible/);
  assert.match(script, /modal === elements\.accountModal[\s\S]*?querySelector\('\[data-modal-autofocus\]'/);
  assert.match(script, /\.mode-panel\.active input:not\(:disabled\), \.mode-panel\.active textarea:not\(:disabled\)/);
  assert.match(styles, /\.account-modal input:focus-visible[\s\S]*outline:\s*none;[\s\S]*box-shadow:/);
  assert.match(styles, /\.account-import-sources\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;/s);
  assert.match(styles, /\.parse-json-button\s*{[^}]*width:\s*70px;[^}]*height:\s*26px;/s);
  assert.match(styles, /\.account-modal input::placeholder\s*{[^}]*font-size:\s*11px;/s);
  assert.match(styles, /#tokenJsonInput\s*{[^}]*font-size:\s*10px;/s);
  assert.match(styles, /#tokenJsonInput::placeholder\s*{[^}]*font-size:\s*10px;/s);
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
  assert.match(styles, /\.theme-segmented\s*{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\);[^}]*width:\s*150px;[^}]*height:\s*28px;[^}]*border:\s*1px solid var\(--line\);[^}]*background:\s*var\(--chip\);[^}]*box-shadow:\s*none;/s);
  assert.match(styles, /\.theme-segment\s*{[^}]*min-width:\s*0;[^}]*font-size:\s*12px;[^}]*font-weight:\s*500;/s);
  assert.match(styles, /\.theme-segment\.active\s*{[^}]*color:\s*var\(--text\);[^}]*background:\s*var\(--panel\);[^}]*box-shadow:\s*none;/s);
  assert.match(styles, /\.theme-segment:focus-visible\s*{[^}]*outline:\s*2px solid var\(--line-strong\);/s);
  assert.doesNotMatch(styles, /\.theme-segment\.active\s*{[^}]*var\(--accent\)/s);
  assert.doesNotMatch(styles, /:root\[data-theme="dark"\] \.theme-segment\.active\s*{[^}]*#1876c9/s);
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
  assert.match(tauriConfig, /"hiddenTitle": true/);
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

test('deleted account cards offer refresh restore and permanent delete in that order', () => {
  const script = readDesktopFile('src/app.js');
  const deletedActions = script.match(/const cardActions = reordering[\s\S]*?: deleted\s*\?\s*`([\s\S]*?)`\s*:\s*`/)?.[1] || '';
  const refreshIndex = deletedActions.indexOf('data-card-action="refresh"');
  const restoreIndex = deletedActions.indexOf('data-card-action="restore"');
  const deleteIndex = deletedActions.indexOf('data-card-action="delete"');

  assert.ok(refreshIndex >= 0 && refreshIndex < restoreIndex && restoreIndex < deleteIndex);
  assert.match(deletedActions, /title="\$\{apiKey \? '测试此 API Key 上游是否可用' : '刷新此账号额度'\}"/);
  assert.match(deletedActions, /data-card-action="restore"[^>]*title="恢复账号"[^>]*>↩<\/button>/);
  assert.match(deletedActions, /data-card-action="delete"[^>]*title="彻底删除"/);
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
  assert.match(css, /\.switch\s*{[^}]*width:\s*40px;[^}]*height:\s*24px;/s);
  assert.match(css, /\.switch span::after\s*{[^}]*width:\s*20px;[^}]*height:\s*20px;[^}]*box-shadow:\s*0 1px 2px rgba\(0,\s*0,\s*0,\s*0\.18\);/s);
  assert.match(css, /\.switch input:checked \+ span::after\s*{[^}]*transform:\s*translateX\(16px\);/s);
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
