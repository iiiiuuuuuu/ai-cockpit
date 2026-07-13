import { createMockSnapshot } from './state.js';

export function createCommandInvoker({ state, normalizeAccount, maskSecret }) {
  return async function invoke(command, args) {
    const api = window.__TAURI__?.core;
    if (api?.invoke) return api.invoke(command, args);

    const snapshot = state.snapshot.accounts.length ? state.snapshot : createMockSnapshot();
    if (command === 'get_desktop_snapshot') return snapshot;
    if (command === 'get_app_version') return '0.1.0';
    if (command === 'open_release_page') return null;
    if (command === 'start_service') return { ...snapshot.service, running: true };
    if (command === 'stop_service') return { ...snapshot.service, running: false };
    if (command === 'save_desktop_settings') {
      snapshot.settings = { ...snapshot.settings, ...(args?.settings || {}) };
      snapshot.service.port = snapshot.settings.port;
      return snapshot;
    }
    if (command === 'save_desktop_account' || command === 'delete_desktop_account') return snapshot;
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
      snapshot.accounts = snapshot.accounts.map(account => {
        const normalized = normalizeAccount(account);
        if (normalized.index !== args?.index) return account;
        const item = { ...normalized.item };
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
