function accountList(accounts) {
  return Array.isArray(accounts) ? accounts : [];
}

function accountItem(account) {
  return account && typeof account === 'object' && account.item && typeof account.item === 'object'
    ? account.item
    : {};
}

function isDeleted(account) {
  const deletedAt = accountItem(account).deleted_at;
  return typeof deletedAt === 'string' && Boolean(deletedAt.trim());
}

function isApiKey(account) {
  return accountItem(account).type === 'apikey';
}

function hasValidIndex(account) {
  return account
    && typeof account === 'object'
    && Number.isInteger(account.index)
    && account.index >= 0;
}

export function createAccountExportSelection(accounts) {
  return selectAccountExportScope(accounts, 'active');
}

export function selectAccountExportScope(accounts, scope) {
  if (scope === 'none') return new Set();
  if (scope !== 'active' && scope !== 'all') return new Set();

  return new Set(accountList(accounts)
    .filter(hasValidIndex)
    .filter(account => scope === 'all' || !isDeleted(account))
    .map(account => account.index));
}

export function filterAccountExportRows(accounts, options = {}) {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const type = ['all', 'token', 'apikey', 'deleted'].includes(safeOptions.type)
    ? safeOptions.type
    : 'all';
  const query = String(safeOptions.query ?? '').trim().toLowerCase();

  const matched = accountList(accounts)
    .filter(hasValidIndex)
    .filter(account => {
      if (!query) return true;
      const item = accountItem(account);
      return [item.alias, item.description, item.account_id, item.credentials?.chatgpt_account_id, item.credentials?.agent_runtime_id, item.base_url]
        .filter(value => value !== null && value !== undefined)
        .some(value => String(value).toLowerCase().includes(query));
    })
    .filter(account => {
      if (type === 'deleted') return isDeleted(account);
      if (type === 'all') return true;
      if (isDeleted(account)) return false;
      return type === 'apikey' ? isApiKey(account) : !isApiKey(account);
    });

  if (type !== 'all') return matched;
  return matched.sort((left, right) => Number(isDeleted(left)) - Number(isDeleted(right)));
}

export function paginateAccountExportRows(rows, page, pageSize = 10) {
  const sourceRows = accountList(rows);
  const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0
    ? Math.max(1, Math.floor(pageSize))
    : 10;
  const total = sourceRows.length;
  const pageCount = Math.max(1, Math.ceil(total / normalizedPageSize));
  const requestedPage = Number.isFinite(page) ? Math.floor(page) : 1;
  const currentPage = Math.min(pageCount, Math.max(1, requestedPage));
  const start = total === 0 ? 0 : (currentPage - 1) * normalizedPageSize;

  return {
    rows: sourceRows.slice(start, start + normalizedPageSize),
    total,
    pageCount,
    currentPage,
    start,
  };
}
