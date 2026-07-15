export function text(value, fallback = '-') {
  const raw = value === null || value === undefined ? '' : String(value).trim();
  return raw || fallback;
}

export function normalizeAccount(item) {
  if (!item || !item.item) return { index: 0, item: item || {}, runtime: {}, is_active: false };
  return {
    ...item,
    is_active: Boolean(item.is_active || item.isActive),
  };
}

export function isApiKeyAccount(account) {
  return normalizeAccount(account).item?.type === 'apikey';
}

export function isDeletedAccount(account) {
  const item = normalizeAccount(account).item || {};
  return typeof item.deleted_at === 'string' && item.deleted_at.trim();
}

export function getDisplayName(account) {
  const item = normalizeAccount(account).item || {};
  if (isApiKeyAccount(account)) {
    return text(item.alias || item.description || item.base_url, '未命名');
  }
  return resolveTokenTitleParts(item).title;
}

export function resolveTokenTitleParts(item) {
  const alias = text(item.alias, '');
  const email = text(item.description, '');
  const accountId = text(item.account_id, '');
  if (alias) return { title: alias, subtitle: email };
  if (email) return { title: email, subtitle: '' };
  if (accountId) return { title: accountId, subtitle: '' };
  return { title: '未命名', subtitle: '' };
}

export function resolveAccountTitleParts(account) {
  const item = normalizeAccount(account).item || {};
  if (isApiKeyAccount(account)) {
    return {
      title: text(item.alias || item.description || item.base_url, '未命名'),
      subtitle: text(item.base_url, ''),
    };
  }
  return resolveTokenTitleParts(item);
}

export function getSearchText(account) {
  const item = normalizeAccount(account).item || {};
  return [
    item.alias,
    item.description,
    item.account_id,
    item.base_url,
    item.apikey,
    item.client_id,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function getSortOrder(account) {
  const value = normalizeAccount(account).item?.sort_order;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return normalizeAccount(account).index;
}

export function getRuntimeValue(account, key) {
  const runtime = normalizeAccount(account).runtime || {};
  return Object.prototype.hasOwnProperty.call(runtime, key) ? runtime[key] : null;
}

export function getPrimaryQuota(account) {
  const value = getRuntimeValue(account, 'primary_remaining_percent');
  return typeof value === 'number' ? value : null;
}

export function getWeeklyQuota(account) {
  const value = getRuntimeValue(account, 'secondary_remaining_percent');
  return typeof value === 'number' ? value : null;
}

export function filterAccounts(accounts, state, searchQuery = '') {
  const query = String(searchQuery).trim().toLowerCase();
  return accounts
    .filter(account => !query || getSearchText(account).includes(query))
    .filter(account => {
      if (state.filterType === 'deleted') return Boolean(isDeletedAccount(account));
      if (isDeletedAccount(account)) return false;
      if (state.filterType === 'token') return !isApiKeyAccount(account);
      if (state.filterType === 'apikey') return isApiKeyAccount(account);
      return true;
    });
}

export function getAccountFilterCounts(accounts, searchQuery = '') {
  const query = String(searchQuery).trim().toLowerCase();
  return accounts.reduce((counts, account) => {
    if (query && !getSearchText(account).includes(query)) return counts;
    if (isDeletedAccount(account)) {
      counts.deleted += 1;
      return counts;
    }

    counts.all += 1;
    counts[isApiKeyAccount(account) ? 'apikey' : 'token'] += 1;
    return counts;
  }, { all: 0, token: 0, apikey: 0, deleted: 0 });
}

export function sortAccounts(accounts, state) {
  if (state.filterType === 'deleted') {
    return [...accounts].sort((left, right) => {
      const leftTime = getDeletedAtTimestamp(left);
      const rightTime = getDeletedAtTimestamp(right);
      if (leftTime !== rightTime) return rightTime - leftTime;
      return getSortOrder(left) - getSortOrder(right);
    });
  }

  const sorted = [...accounts].sort((left, right) => {
    const activeDiff = Number(Boolean(right.is_active)) - Number(Boolean(left.is_active));
    if (activeDiff !== 0) return activeDiff;
    if (state.sortBy === 'primaryQuota') {
      return quotaSortValue(left, getPrimaryQuota) - quotaSortValue(right, getPrimaryQuota);
    }
    if (state.sortBy === 'weeklyQuota') {
      return quotaSortValue(left, getWeeklyQuota) - quotaSortValue(right, getWeeklyQuota);
    }
    return getSortOrder(left) - getSortOrder(right);
  });

  const shouldReverseRemaining = state.sortBy === 'default'
    ? state.sortDirection === 'asc'
    : state.sortDirection === 'desc';
  if (shouldReverseRemaining) {
    const activeAccounts = sorted.filter(account => Boolean(account.is_active));
    const remainingAccounts = sorted.filter(account => !account.is_active).reverse();
    return [...activeAccounts, ...remainingAccounts];
  }
  return sorted;
}

export function quotaSortValue(account, getter) {
  const value = getter(account);
  return typeof value === 'number' ? value : -1;
}

export function formatPercent(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}%` : '--';
}

export function clampPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function quotaTone(value) {
  if (typeof value !== 'number') return 'unknown';
  if (value <= 0) return 'zero';
  if (value < 30) return 'low';
  return '';
}

export function formatPrice(account) {
  const raw = Number(normalizeAccount(account).item?.price_yuan);
  if (!Number.isFinite(raw) || raw <= 0) return '';
  return Number.isInteger(raw) ? `¥${raw}` : `¥${raw.toFixed(2)}`;
}

export function parseDateTime(value) {
  const normalized = String(value || '').trim().replace(' ', 'T');
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTimeLocalValue(value) {
  const date = value instanceof Date ? value : parseDateTime(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDeletedAt(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = parseDateTime(raw);
  const date = parsed || new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.replace('T', ' ').replace(/:\d{2}(?:\.\d+)?(?:Z)?$/, '');
  return formatDateTimeLocalValue(date).replace('T', ' ');
}

function getDeletedAtTimestamp(account) {
  const raw = String(normalizeAccount(account).item?.deleted_at || '').trim();
  if (!raw) return Number.NEGATIVE_INFINITY;
  const parsed = parseDateTime(raw);
  if (parsed) return parsed.getTime();
  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

export function setDateTimeInput(input, value) {
  input.value = formatDateTimeLocalValue(value);
}

export function readDateTimeInput(input) {
  return input.value.trim() || null;
}

export function formatUsageDays(account) {
  const item = normalizeAccount(account).item || {};
  const start = parseDateTime(item.started_at);
  if (!start) return '';
  const stop = parseDateTime(item.stopped_at) || new Date();
  const days = Math.max(0, (stop.getTime() - start.getTime()) / 86400000);
  if (days < 1) {
    const hours = Math.floor(days * 24);
    return hours <= 0 ? '已使用 <1 小时' : `已使用 ${hours} 小时`;
  }
  return `已使用 ${Math.floor(days)} 天`;
}

export function formatLastChecked(account) {
  const value = getRuntimeValue(account, 'last_checked_at');
  if (typeof value !== 'number' || !Number.isFinite(value)) return '尚未检查';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '';
  const minutes = Math.round(seconds / 60);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const parts = [];
  if (days) parts.push(`${days}天`);
  if (hours) parts.push(`${hours}小时`);
  if (!days && rest) parts.push(`${rest}分钟`);
  return parts.join('') || '不到1分钟';
}

export function formatResetText(account, prefix) {
  const resetAfter = getRuntimeValue(account, `${prefix}_reset_after_seconds`);
  const resetAt = getRuntimeValue(account, `${prefix}_reset_at`);
  const duration = formatDuration(resetAfter);
  if (duration) return `重置：约 ${duration}后`;
  if (typeof resetAt === 'number' && Number.isFinite(resetAt)) {
    return `重置：${new Date(resetAt * 1000).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`;
  }
  return '重置：--';
}

export function stripDiagnosticIds(errorText) {
  return String(errorText || '')
    .replace(/\s*\(request_id:\s*[^)]+\)/gi, '')
    .replace(/\s*\[request_id:\s*[^\]]+\]/gi, '')
    .replace(/\s*\[trace_id:\s*[^\]]+\]/gi, '')
    .replace(/\s*request[_ -]?id[:=]\s*\S+/gi, '')
    .replace(/\s*trace[_ -]?id[:=]\s*\S+/gi, '')
    .trim();
}

export function formatRuntimeErrorText(errorText, account = null) {
  if (!errorText) return '';
  const normalizedText = stripDiagnosticIds(errorText);
  const lowerText = normalizedText.toLowerCase();

  if (/\bquota check status\s+401\b/i.test(normalizedText) || (/\b401\b/.test(normalizedText) && /auth|unauthorized|鉴权|认证/.test(lowerText))) {
    return account && isApiKeyAccount(account)
      ? '上游鉴权失败 401，请检查 API Key 或 Base URL'
      : '鉴权失败 401，请重新登录或更新 Token';
  }
  if (/api key|apikey/.test(lowerText) && /\b401\b|unauthorized|invalid|鉴权|认证/.test(lowerText)) {
    return '上游鉴权失败 401，请检查 API Key 或 Base URL';
  }
  if (/monthly quota exceeded/i.test(normalizedText)) return '上游月度额度已用完';
  if (/insufficient quota/i.test(normalizedText)) return '上游额度不足';
  if (/quota exceeded|usage limit/i.test(normalizedText)) return '上游额度已用完';
  if (/timeout|timed out|超时/.test(lowerText)) return '检查请求超时，请稍后重试';
  if (/network|socket|tls|econnreset|etimedout|connection|连接/.test(lowerText)) {
    return '网络连接失败，请检查代理或上游连通性';
  }

  return normalizedText
    .replace(/\bquota check status\s+401\b/gi, '额度检查接口鉴权失败（401）')
    .replace(/\bmonthly quota exceeded\b/gi, '上游月度额度已用完')
    .replace(/\binsufficient quota\b/gi, '上游额度不足')
    .replace(/\bquota exceeded\b/gi, '上游额度已用完');
}

export function formatReasonText(reason) {
  const map = {
    ok: '正常',
    unchecked: '未检查',
    apikey: 'API Key 上游',
    missing_credentials: '缺少凭证',
    rate_limit_not_allowed: '额度不可用',
    rate_limit_reached: '额度已用尽',
    membership_expired: '会员已过期',
    responses_insufficient_quota: 'Responses 配额不足',
    responses_usage_limit_reached: 'Responses 窗口额度已用尽',
    responses_usage_not_included: 'Responses 套餐不支持',
    quota_check_failed: '额度检查失败',
    apikey_check_failed: 'API Key 检查失败',
    deleted: '已标记删除',
  };

  if (typeof reason === 'string' && reason.startsWith('remaining_below_')) return '5小时配额过低';
  if (typeof reason === 'string' && reason.startsWith('secondary_remaining_not_above_')) return '周配额过低';
  return map[reason] || reason || '未知';
}

export function formatSelectionReason(reason) {
  const map = {
    admin_manual_activate: '手动切换',
    admin_refresh_single: '单账号刷新后校正',
    admin_refresh: '全量刷新后校正',
    poll: '额度轮询校正',
    proxy_request: '代理请求校正',
    claude_request: 'Claude 请求校正',
    quota_update: '额度更新校正',
    admin_update_config: '配置变更后自动选择',
    admin_update_settings: '设置变更后自动选择',
    responses_failover: 'Responses 错误自动切换',
    claude_responses_failover: 'Claude Responses 错误自动切换',
    runtime_unavailable: '运行时不可用自动切换',
    startup: '启动初始化',
  };

  return map[reason] || reason || '';
}

export function getRuntimeError(account) {
  const runtime = normalizeAccount(account).runtime || {};
  let errorText = '';
  if (typeof runtime.last_error === 'string' && runtime.last_error.trim()) {
    errorText = runtime.last_error.trim();
  } else if (typeof runtime.runtime_summary === 'string') {
    const match = runtime.runtime_summary.match(/错误=(.+)$/);
    errorText = match ? match[1].trim() : '';
  }
  return formatRuntimeErrorText(errorText, account);
}

export function getAccountRefreshResult(account) {
  const normalized = normalizeAccount(account);
  const runtime = normalized.runtime || {};
  const checked = typeof runtime.last_checked_at === 'number' && Number.isFinite(runtime.last_checked_at);
  if (!checked) return { checked: false, ok: false, message: '' };

  const errorText = getRuntimeError(normalized);
  if (errorText) return { checked: true, ok: false, message: errorText };

  const reason = runtime.reason || '';
  if (reason === 'missing_credentials') {
    return {
      checked: true,
      ok: false,
      message: isApiKeyAccount(normalized) ? 'API Key 缺失或无效' : 'Token 已失效或缺少凭证',
    };
  }
  if (reason === 'quota_check_failed') {
    return { checked: true, ok: false, message: '额度检查失败，请稍后重试' };
  }
  if (reason === 'apikey_check_failed') {
    return { checked: true, ok: false, message: '上游检查失败，请检查 API Key 或 Base URL' };
  }
  if (reason === 'deleted') {
    return { checked: true, ok: false, message: '未获得检查结果' };
  }

  return { checked: true, ok: true, message: '检查成功' };
}

export function getHealthText(account) {
  if (isDeletedAccount(account)) return '已标记删除';
  if (isApiKeyAccount(account)) {
    if (normalizeAccount(account).runtime?.available === false) {
      return formatReasonText(normalizeAccount(account).runtime?.reason);
    }
    return '不检查额度';
  }
  if (normalizeAccount(account).runtime?.available === false) {
    return formatReasonText(normalizeAccount(account).runtime?.reason);
  }
  return formatReasonText(normalizeAccount(account).runtime?.reason || 'ok');
}

export function getUnavailableReasonText(account) {
  const errorText = getRuntimeError(account);
  if (errorText) return errorText;
  if (isApiKeyAccount(account)) return '上游不可用，请检查 API Key 或 Base URL';
  if (normalizeAccount(account).runtime?.reason === 'quota_check_failed') {
    return '额度检查失败，请稍后重试或重新登录该 Token';
  }
  return getHealthText(account) || '当前账号不可用';
}

export function formatReason(account) {
  const runtime = normalizeAccount(account).runtime || {};
  return formatReasonText(runtime.reason || (isApiKeyAccount(account) ? 'apikey' : 'unchecked'));
}

export function getAvailability(account) {
  if (isDeletedAccount(account)) return false;
  return normalizeAccount(account).runtime?.available !== false;
}

export function maskSecret(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (raw.length <= 10) return '***';
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}
