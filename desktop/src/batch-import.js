import { parseTokenJsonObject } from './account-import.js';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(...values) {
  const value = values.find(item => typeof item === 'string' && item.trim());
  return value ? value.trim() : '';
}

function normalizeEmail(value) {
  return stringValue(value).toLowerCase();
}

function normalizeLifecycleFields(source) {
  const deletedAt = stringValue(source.deleted_at, source.deletedAt);
  return {
    ...(deletedAt ? { deleted_at: deletedAt } : {}),
    ...(source.auto_switch_disabled === true || source.autoSwitchDisabled === true
      ? { auto_switch_disabled: true }
      : {}),
  };
}

export function normalizeBatchBaseUrl(value) {
  return stringValue(value).replace(/\/+$/, '');
}

function decodeJwtPayload(token) {
  const segment = String(token || '').split('.')[1];
  if (!segment) return {};
  try {
    const normalized = segment
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(segment.length / 4) * 4, '=');
    return JSON.parse(globalThis.atob(normalized));
  } catch {
    return {};
  }
}

function tokenSubject(account) {
  return stringValue(decodeJwtPayload(account?.access_token).sub);
}

function isApiKeyInput(source) {
  const type = stringValue(source?.type, source?.mode).toLowerCase();
  return type === 'apikey'
    || type === 'api_key'
    || Boolean(stringValue(source?.apikey, source?.api_key, source?.apiKey));
}

function normalizeApiKeyInput(source, startedAt) {
  const baseUrl = normalizeBatchBaseUrl(source.base_url || source.baseUrl);
  const apikey = stringValue(source.apikey, source.api_key, source.apiKey);
  if (!baseUrl) throw new Error('缺少 base_url');
  if (!apikey) throw new Error('缺少 API Key');

  return {
    mode: 'apikey',
    description: stringValue(source.description, source.alias),
    alias: stringValue(source.alias),
    price_yuan: source.price_yuan ?? source.priceYuan ?? '',
    started_at: stringValue(source.started_at, source.startedAt, startedAt),
    stopped_at: stringValue(source.stopped_at, source.stoppedAt),
    base_url: baseUrl,
    apikey,
    ...normalizeLifecycleFields(source),
  };
}

function normalizeTokenInput(source, startedAt) {
  const parsed = parseTokenJsonObject(source, { startedAt });
  if (!parsed.access_token) throw new Error('缺少 access_token');
  return { mode: 'token', ...parsed, ...normalizeLifecycleFields(source) };
}

function expandParsedSource(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (isObject(parsed) && parsed.format === 'ai-cockpit-account-export') {
    if (parsed.version !== 1) throw new Error('暂不支持此 AI Cockpit 导出文件版本');
    if (!Array.isArray(parsed.accounts)) throw new Error('导出文件 accounts 必须是数组');
    return parsed.accounts;
  }
  if (isObject(parsed) && Array.isArray(parsed.accounts)) return parsed.accounts;
  if (isObject(parsed) && Array.isArray(parsed.configs)) return parsed.configs;
  return [parsed];
}

function invalidRecord(source, sourceIndex, itemIndex, error) {
  return {
    id: `${sourceIndex}:${itemIndex}`,
    source,
    sourceIndex,
    itemIndex,
    account: null,
    error: error instanceof Error ? error.message : String(error),
  };
}

export function parseBatchAccountSources(sources, options = {}) {
  const startedAt = stringValue(options.startedAt);
  const records = [];

  (Array.isArray(sources) ? sources : []).forEach((source, sourceIndex) => {
    const sourceName = stringValue(source?.name) || `文件 ${sourceIndex + 1}`;
    let parsed;
    try {
      parsed = JSON.parse(String(source?.content ?? ''));
    } catch (error) {
      records.push(invalidRecord(sourceName, sourceIndex, 0, `JSON 解析失败：${error.message}`));
      return;
    }

    let items;
    try {
      items = expandParsedSource(parsed);
    } catch (error) {
      records.push(invalidRecord(sourceName, sourceIndex, 0, error));
      return;
    }

    items.forEach((item, itemIndex) => {
      if (!isObject(item)) {
        records.push(invalidRecord(sourceName, sourceIndex, itemIndex, '账号必须是 JSON 对象'));
        return;
      }
      try {
        const account = isApiKeyInput(item)
          ? normalizeApiKeyInput(item, startedAt)
          : normalizeTokenInput(item, startedAt);
        records.push({
          id: `${sourceIndex}:${itemIndex}`,
          source: sourceName,
          sourceIndex,
          itemIndex,
          account,
          error: '',
        });
      } catch (error) {
        records.push(invalidRecord(sourceName, sourceIndex, itemIndex, error));
      }
    });
  });

  return records;
}

function normalizeExistingAccount(account) {
  const item = isObject(account?.item) ? account.item : {};
  const apiKey = String(item.type || '').toLowerCase() === 'apikey';
  return {
    index: Number(account?.index),
    deleted: Boolean(stringValue(item.deleted_at)),
    account: apiKey
      ? {
          mode: 'apikey',
          description: stringValue(item.description, item.alias),
          alias: stringValue(item.alias),
          base_url: normalizeBatchBaseUrl(item.base_url || item.baseUrl),
          apikey: stringValue(item.apikey, item.api_key, item.apiKey),
        }
      : {
          mode: 'token',
          description: stringValue(item.description),
          alias: stringValue(item.alias),
          account_id: stringValue(item.account_id, item.accountId),
          client_id: stringValue(item.client_id, item.clientId),
          access_token: stringValue(item.access_token, item.accessToken),
          refresh_token: stringValue(item.refresh_token, item.refreshToken),
        },
  };
}

function strongIdentityKeys(account, includeSubjectFallback = false) {
  if (!account) return [];
  if (account.mode === 'apikey') {
    const baseUrl = normalizeBatchBaseUrl(account.base_url);
    const apikey = stringValue(account.apikey);
    return baseUrl && apikey ? [`apikey:${baseUrl}:${apikey}`] : [];
  }

  const keys = [];
  const accountId = stringValue(account.account_id);
  const subject = tokenSubject(account);
  if (accountId) keys.push(`token:account:${accountId}`);
  if (subject && (!accountId || includeSubjectFallback)) keys.push(`token:subject:${subject}`);
  return keys;
}

function credentialsDiffer(incoming, existing) {
  if (incoming.mode === 'apikey') return false;
  if (stringValue(incoming.access_token) !== stringValue(existing.access_token)) return true;
  if (incoming.refresh_token && stringValue(incoming.refresh_token) !== stringValue(existing.refresh_token)) return true;
  if (incoming.client_id && stringValue(incoming.client_id) !== stringValue(existing.client_id)) return true;
  return false;
}

export function classifyBatchImportRecords(records, existingAccounts) {
  const existing = (Array.isArray(existingAccounts) ? existingAccounts : []).map(normalizeExistingAccount);
  const existingByIdentity = new Map();
  const existingByEmail = new Map();
  const seenBatchIdentities = new Set();

  existing.forEach(entry => {
    strongIdentityKeys(entry.account, true).forEach(key => existingByIdentity.set(key, entry));
    const email = normalizeEmail(entry.account.description);
    if (email && !existingByEmail.has(email)) existingByEmail.set(email, entry);
  });

  return (Array.isArray(records) ? records : []).map(record => {
    if (!record.account || record.error) return { ...record, status: 'invalid', existingIndex: null };

    const identities = strongIdentityKeys(record.account);
    if (identities.some(key => seenBatchIdentities.has(key))) {
      return { ...record, status: 'batch_duplicate', existingIndex: null };
    }

    const matched = identities.map(key => existingByIdentity.get(key)).find(Boolean);
    if (matched) {
      identities.forEach(key => seenBatchIdentities.add(key));
      const status = matched.deleted
        ? 'deleted'
        : credentialsDiffer(record.account, matched.account)
          ? 'credential_changed'
          : 'existing';
      return { ...record, status, existingIndex: matched.index };
    }

    const email = normalizeEmail(record.account.description);
    if (!identities.length && email && existingByEmail.has(email)) {
      return {
        ...record,
        status: 'suspected_duplicate',
        existingIndex: existingByEmail.get(email).index,
      };
    }

    identities.forEach(key => seenBatchIdentities.add(key));
    return { ...record, status: 'new', existingIndex: null };
  });
}

export function selectBatchImportAccounts(preview, updateExisting) {
  return (Array.isArray(preview) ? preview : [])
    .filter(record => record.status === 'new' || (updateExisting && record.status === 'credential_changed'))
    .map(record => ({
      ...record.account,
      ...(record.status === 'credential_changed' && Number.isInteger(record.existingIndex)
        ? { existing_index: record.existingIndex }
        : {}),
    }));
}

export function getBatchImportSummary(preview) {
  const summary = {
    total: 0,
    new: 0,
    existing: 0,
    credential_changed: 0,
    suspected_duplicate: 0,
    batch_duplicate: 0,
    deleted: 0,
    invalid: 0,
  };
  (Array.isArray(preview) ? preview : []).forEach(record => {
    summary.total += 1;
    if (Object.prototype.hasOwnProperty.call(summary, record.status)) summary[record.status] += 1;
  });
  return summary;
}
