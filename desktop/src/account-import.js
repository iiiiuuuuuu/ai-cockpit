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

function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '') || '';
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSub2ApiExportItem(source) {
  if (!isObject(source)) return false;
  if (String(source.subtype || '').trim().toLowerCase() === 'sub2api') {
    return isObject(source.credentials);
  }
  return String(source.platform || '').trim().toLowerCase() === 'openai'
    && String(source.type || '').trim().toLowerCase() === 'oauth'
    && String(source.credentials?.auth_mode || '').trim().toLowerCase() === 'agentidentity';
}

function normalizeSub2ApiCredentials(source) {
  const credentials = isObject(source.credentials) ? source.credentials : source;
  const extra = isObject(source.extra) ? source.extra : {};
  const normalized = {
    auth_mode: 'agentIdentity',
    agent_runtime_id: firstValue(credentials.agent_runtime_id),
    agent_private_key: firstValue(credentials.agent_private_key),
    task_id: firstValue(credentials.task_id),
    chatgpt_account_id: firstValue(
      credentials.chatgpt_account_id,
      credentials.account_id,
      extra.chatgpt_account_id,
      extra.account_id,
    ),
    chatgpt_user_id: firstValue(credentials.chatgpt_user_id),
    chatgpt_account_is_fedramp: credentials.chatgpt_account_is_fedramp === true,
    email: firstValue(credentials.email, extra.email),
    plan_type: firstValue(credentials.plan_type),
  };
  for (const field of ['task_id', 'email', 'plan_type']) {
    if (!normalized[field]) delete normalized[field];
  }
  return normalized;
}

export function parseTokenJsonObject(parsed, options = {}) {
  const source = parsed && typeof parsed === 'object' ? parsed : {};

  if (isSub2ApiExportItem(source)) {
    const credentials = normalizeSub2ApiCredentials(source);
    return {
      subtype: 'sub2api',
      description: firstValue(source.description, credentials.email, source.name, credentials.chatgpt_account_id),
      alias: firstValue(source.alias),
      price_yuan: firstValue(source.price_yuan, source.priceYuan),
      started_at: firstValue(source.started_at, source.startedAt, options.startedAt),
      stopped_at: firstValue(source.stopped_at, source.stoppedAt),
      credentials,
    };
  }

  const tokens = source.tokens && typeof source.tokens === 'object' ? source.tokens : {};
  const user = source.user && typeof source.user === 'object' ? source.user : {};
  const account = source.account && typeof source.account === 'object' ? source.account : {};
  const accessToken = firstValue(
    source.access_token,
    source.accessToken,
    source.token,
    tokens.access_token,
    tokens.accessToken,
  );
  const idToken = firstValue(source.id_token, source.idToken, tokens.id_token, tokens.idToken);
  const accessClaims = decodeJwtPayload(accessToken);
  const idClaims = decodeJwtPayload(idToken);
  const auth = source['https://api.openai.com/auth'] || source.auth || {};
  const profile = source['https://api.openai.com/profile'] || source.profile || {};
  const claimAuth = accessClaims['https://api.openai.com/auth']
    || idClaims['https://api.openai.com/auth']
    || {};
  const claimProfile = accessClaims['https://api.openai.com/profile']
    || idClaims['https://api.openai.com/profile']
    || {};

  return {
    description: firstValue(
      source.description,
      source.email,
      user.email,
      profile.email,
      claimProfile.email,
      accessClaims.email,
      idClaims.email,
    ),
    alias: source.alias || '',
    price_yuan: source.price_yuan || '',
    started_at: firstValue(source.started_at, source.startedAt, options.startedAt),
    stopped_at: firstValue(source.stopped_at, source.stoppedAt),
    account_id: firstValue(
      source.account_id,
      source.accountId,
      account.id,
      tokens.account_id,
      tokens.accountId,
      auth.chatgpt_account_id,
      claimAuth.chatgpt_account_id,
    ),
    client_id: firstValue(
      source.client_id,
      source.clientId,
      tokens.client_id,
      tokens.clientId,
      accessClaims.client_id,
      idClaims.client_id,
    ),
    access_token: accessToken,
    refresh_token: firstValue(
      source.refresh_token,
      source.refreshToken,
      tokens.refresh_token,
      tokens.refreshToken,
    ),
  };
}

export function getAuthJsonDisplayPath(userAgent = '') {
  return /Windows/i.test(String(userAgent))
    ? '%USERPROFILE%\\.codex\\auth.json'
    : '~/.codex/auth.json';
}
