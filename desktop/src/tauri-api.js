import { createMockSnapshot } from './state.js';

export function createCommandInvoker({ state, normalizeAccount, maskSecret }) {
  return async function invoke(command, args) {
    const api = window.__TAURI__?.core;
    if (api?.invoke) return api.invoke(command, args);

    const snapshot = state.snapshot.accounts.length ? state.snapshot : createMockSnapshot();
    if (command === 'get_desktop_snapshot') return snapshot;
    if (command === 'get_app_version') return '0.1.0';
    if (command === 'open_release_page' || command === 'open_account_help_page') return null;
    if (command === 'start_service') return { ...snapshot.service, running: true };
    if (command === 'stop_service') return { ...snapshot.service, running: false };
    if (command === 'save_desktop_settings') {
      snapshot.settings = { ...snapshot.settings, ...(args?.settings || {}) };
      snapshot.service.port = snapshot.settings.port;
      return snapshot;
    }
    if (command === 'save_desktop_account' || command === 'delete_desktop_account') return snapshot;
    if (command === 'export_desktop_accounts') {
      const indexes = Array.isArray(args?.indexes) ? args.indexes : [];
      return { saved: true, exported: indexes.length };
    }
    if (command === 'import_desktop_accounts') {
      const accounts = Array.isArray(args?.accounts) ? args.accounts : [];
      let imported = 0;
      let updated = 0;
      let skipped = 0;
      for (const request of accounts) {
        const existingIndex = request.mode === 'token' && request.account_id
          ? snapshot.accounts.findIndex(account => normalizeAccount(account).item?.account_id === request.account_id)
          : request.mode === 'apikey'
            ? snapshot.accounts.findIndex(account => {
                const item = normalizeAccount(account).item || {};
                return item.type === 'apikey'
                  && String(item.base_url || '').replace(/\/+$/, '') === String(request.base_url || '').replace(/\/+$/, '')
                  && item.apikey === request.apikey;
              })
            : -1;
        if (existingIndex >= 0) {
          if (args?.updateExisting && request.mode === 'token') {
            const normalized = normalizeAccount(snapshot.accounts[existingIndex]);
            snapshot.accounts[existingIndex] = {
              ...normalized,
              item: {
                ...normalized.item,
                access_token: request.access_token,
                refresh_token: request.refresh_token || normalized.item.refresh_token,
                client_id: request.client_id || normalized.item.client_id,
                description: request.description || normalized.item.description,
              },
            };
            updated += 1;
          } else {
            skipped += 1;
          }
          continue;
        }
        const index = snapshot.accounts.length;
        const item = { ...request, sort_order: (index + 1) * 10 };
        delete item.mode;
        if (request.mode === 'apikey') item.type = 'apikey';
        snapshot.accounts.push({
          index,
          item,
          runtime: { available: true, reason: 'unchecked' },
          is_active: false,
        });
        imported += 1;
      }
      return { snapshot, imported, updated, skipped };
    }
    if (command === 'save_desktop_account_order') {
      const orderByIndex = new Map((args?.orderedIndexes || []).map((index, position) => [index, (position + 1) * 10]));
      snapshot.accounts = snapshot.accounts.map(account => {
        const normalized = normalizeAccount(account);
        const sortOrder = orderByIndex.get(normalized.index);
        return sortOrder
          ? { ...normalized, item: { ...normalized.item, sort_order: sortOrder } }
          : account;
      });
      return snapshot;
    }
    if (command === 'mark_desktop_account_deleted') {
      snapshot.accounts = snapshot.accounts.map(account => {
        const normalized = normalizeAccount(account);
        return normalized.index === args?.index
          ? { ...normalized, item: { ...normalized.item, deleted_at: new Date().toISOString() } }
          : account;
      });
      return snapshot;
    }
    if (command === 'activate_desktop_account') {
      snapshot.accounts = snapshot.accounts.map(account => ({
        ...account,
        is_active: normalizeAccount(account).index === args?.index,
      }));
      return snapshot;
    }
    if (command === 'refresh_desktop_account') return snapshot;
    if (command === 'toggle_desktop_account_auto_switch') {
      snapshot.accounts = snapshot.accounts.map(account => {
        const normalized = normalizeAccount(account);
        return normalized.index === args?.index
          ? { ...normalized, item: { ...normalized.item, auto_switch_disabled: Boolean(args?.disabled) } }
          : account;
      });
      return snapshot;
    }
    if (command === 'restore_desktop_account') {
      const maxSortOrder = snapshot.accounts
        .filter(account => !normalizeAccount(account).item?.deleted_at)
        .reduce((maximum, account) => Math.max(maximum, Number(normalizeAccount(account).item?.sort_order) || 0), 0);
      snapshot.accounts = snapshot.accounts.map(account => {
        const normalized = normalizeAccount(account);
        if (normalized.index !== args?.index) return account;
        const item = { ...normalized.item, sort_order: maxSortOrder + 10 };
        delete item.deleted_at;
        return { ...normalized, item };
      });
      return snapshot;
    }
    if (command === 'save_access_token') {
      const token = args?.request?.token || '';
      snapshot.accessTokens = [
        ...(snapshot.accessTokens || []),
        {
          index: snapshot.accessTokens?.length || 0,
          name: args?.request?.name || '',
          token,
          masked: maskSecret(token),
        },
      ];
      return snapshot;
    }
    if (command === 'delete_access_token') return snapshot;
    throw new Error(`未知命令: ${command}`);
  };
}
