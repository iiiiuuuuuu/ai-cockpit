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

export function parseTokenJsonObject(parsed, options = {}) {
  const source = parsed && typeof parsed === 'object' ? parsed : {};
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
