const GITHUB_RELEASE_API = 'https://api.github.com/repos/iiiiuuuuuu/ai-cockpit/releases/latest';
const PROJECT_RELEASE_PREFIX = 'https://github.com/iiiiuuuuuu/ai-cockpit/releases/';
const UPDATE_CACHE_KEY = 'ai-cockpit-update-check';
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function parseVersion(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) throw new Error(`无效版本号：${value || '空'}`);
  return {
    text: `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ''}`,
    numbers: match.slice(1, 4).map(Number),
    prerelease: match[4] || '',
  };
}

export function isNewerVersion(latestVersion, currentVersion) {
  const latest = parseVersion(latestVersion);
  const current = parseVersion(currentVersion);
  for (let index = 0; index < latest.numbers.length; index += 1) {
    if (latest.numbers[index] !== current.numbers[index]) {
      return latest.numbers[index] > current.numbers[index];
    }
  }
  if (!latest.prerelease && current.prerelease) return true;
  if (latest.prerelease && !current.prerelease) return false;
  return latest.prerelease.localeCompare(current.prerelease) > 0;
}

export function parseGithubRelease(release, currentVersion) {
  const latestVersion = parseVersion(release?.tag_name).text;
  const normalizedCurrentVersion = parseVersion(currentVersion).text;
  const releaseUrl = String(release?.html_url || '');
  if (!releaseUrl.startsWith(PROJECT_RELEASE_PREFIX)) {
    throw new Error('GitHub 返回了无效的版本下载地址');
  }
  return {
    currentVersion: normalizedCurrentVersion,
    latestVersion,
    releaseUrl,
    updateAvailable: isNewerVersion(latestVersion, normalizedCurrentVersion),
  };
}

export async function fetchLatestRelease(currentVersion, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(GITHUB_RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (response.status === 404) {
    const normalizedCurrentVersion = parseVersion(currentVersion).text;
    return {
      currentVersion: normalizedCurrentVersion,
      latestVersion: normalizedCurrentVersion,
      releaseUrl: `${PROJECT_RELEASE_PREFIX}latest`,
      updateAvailable: false,
      releasePublished: false,
    };
  }
  if (!response.ok) throw new Error(`检查更新失败（${response.status}）`);
  return parseGithubRelease(await response.json(), currentVersion);
}

export function readCachedUpdate(currentVersion, storage = globalThis.localStorage, now = Date.now()) {
  try {
    const cached = JSON.parse(storage.getItem(UPDATE_CACHE_KEY) || 'null');
    if (!cached || now - cached.checkedAt >= UPDATE_CHECK_INTERVAL_MS) return null;
    if (cached.info?.currentVersion !== parseVersion(currentVersion).text) return null;
    if (cached.info.releasePublished === false) {
      return cached.info.releaseUrl === `${PROJECT_RELEASE_PREFIX}latest` ? cached.info : null;
    }
    return parseGithubRelease({
      tag_name: cached.info.latestVersion,
      html_url: cached.info.releaseUrl,
    }, currentVersion);
  } catch {
    return null;
  }
}

export function writeCachedUpdate(info, storage = globalThis.localStorage, now = Date.now()) {
  try {
    storage.setItem(UPDATE_CACHE_KEY, JSON.stringify({ checkedAt: now, info }));
  } catch {
    // Update checks still work when local storage is unavailable.
  }
}
