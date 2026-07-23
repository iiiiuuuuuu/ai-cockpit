export function createEmptySnapshot() {
  return {
    service: { running: false, portConflict: false, port: 3009, message: '' },
    settings: {
      port: 3009,
      proxyPort: null,
      routingPreference: 'token_first',
      autoSwitch: true,
    },
    accounts: [],
    accessTokens: [],
  };
}

export function normalizeSnapshot(snapshot) {
  const empty = createEmptySnapshot();
  return {
    ...empty,
    ...(snapshot || {}),
    service: { ...empty.service, ...(snapshot?.service || {}) },
    settings: { ...empty.settings, ...(snapshot?.settings || {}) },
    accounts: Array.isArray(snapshot?.accounts) ? snapshot.accounts : [],
    accessTokens: Array.isArray(snapshot?.accessTokens) ? snapshot.accessTokens : [],
  };
}

export function createUiState() {
  return {
    snapshot: createEmptySnapshot(),
    page: 'accounts',
    filterType: 'all',
    sortBy: 'default',
    sortDirection: 'desc',
    reorderMode: false,
    reorderDraft: [],
    reorderPreviousView: null,
    reorderSaving: false,
    accountModalMode: 'token',
    accountModalSubtype: '',
    accountModalCredentials: null,
    editingAccountIndex: null,
    batchImport: {
      stage: 'files',
      sources: [],
      preview: [],
      processing: false,
      result: null,
    },
    confirmResolver: null,
    toastTimer: null,
    busy: false,
    serviceTransition: null,
    appVersion: '',
    update: { checking: false, info: null },
  };
}

export function createMockSnapshot() {
  return {
    ...createEmptySnapshot(),
    service: { running: true, port: 3009 },
    accounts: [
      {
        index: 0,
        is_active: true,
        item: {
          alias: 'GPT Plus 主账号',
          description: 'demo@example.com',
          account_id: 'acc_demo',
          access_token: 'eyJhbGciOiJkZW1vIn0.demo-token',
          refresh_token: 'demo-refresh-token',
          client_id: 'demo-client',
          started_at: '2026-07-01T09:00',
          price_yuan: 115,
          sort_order: 10,
        },
        runtime: {
          available: true,
          reason: 'ok',
          primary_remaining_percent: 72,
          secondary_remaining_percent: 64,
          primary_reset_after_seconds: 3200,
          secondary_reset_after_seconds: 146000,
          last_checked_at: Date.now() - 360000,
          last_selection_reason: 'startup',
        },
      },
      {
        index: 1,
        item: {
          type: 'apikey',
          alias: 'OpenAI Compatible',
          base_url: 'https://api.openai.com/v1',
          apikey: 'sk-demo-secret',
          started_at: '2026-07-02T12:00',
          sort_order: 20,
        },
        runtime: { available: true, reason: 'apikey', last_checked_at: Date.now() - 720000 },
      },
    ],
    accessTokens: [
      { index: 0, name: '个人设备', token: 'sk-ai-cockpit-demo', masked: 'sk-...demo' },
    ],
  };
}
