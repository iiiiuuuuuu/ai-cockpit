const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('desktop package excludes discontinued browser extension and command surfaces', () => {
  assert.equal(fs.existsSync(path.join(root, 'public')), false);
  assert.equal(fs.existsSync(path.join(root, 'extensions', 'chrome')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'mac')), false);
  assert.equal(fs.existsSync(path.join(root, 'app', 'log-reader.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'openai-api-key.json.example')), false);

  const prepareResources = read('desktop/scripts/prepare-resources.mjs');
  assert.doesNotMatch(prepareResources, /['"]public['"]/);
  assert.doesNotMatch(prepareResources, /openai-api-key\.json\.example/);

  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.dependencies.echarts, undefined);
  assert.equal(packageJson.dependencies['http-proxy'], undefined);
});

test('Tauri shell is split by native responsibility', () => {
  for (const moduleName of ['runtime.rs', 'service.rs', 'desktop_data.rs', 'commands.rs', 'shell.rs']) {
    assert.equal(
      fs.existsSync(path.join(root, 'desktop', 'src-tauri', 'src', moduleName)),
      true,
      `${moduleName} should exist`,
    );
  }

  const main = read('desktop/src-tauri/src/main.rs');
  const appBuilder = main.split('#[cfg(test)]')[0];
  assert.match(main, /mod commands;/);
  assert.match(main, /mod desktop_data;/);
  assert.match(main, /mod runtime;/);
  assert.match(main, /mod service;/);
  assert.match(main, /mod shell;/);
  assert.doesNotMatch(appBuilder, /read_recent_logs/);
  assert.doesNotMatch(appBuilder, /open_admin_window/);
  assert.doesNotMatch(appBuilder, /open_admin_in_browser/);
  assert.doesNotMatch(appBuilder, /show_config_page/);
  assert.doesNotMatch(appBuilder, /restart_service/);

  const runtime = read('desktop/src-tauri/src/runtime.rs');
  assert.match(runtime, /dir\.join\(APP_DIR_NAME\)/);
  assert.doesNotMatch(runtime, /join\(APP_DIR_NAME\)\.join\(RUNTIME_DIR_NAME\)/);
});

test('desktop frontend loads focused ES modules', () => {
  for (const moduleName of ['app.js', 'account-model.js', 'tauri-api.js', 'state.js', 'render.js', 'actions.js', 'theme.js', 'update.js']) {
    assert.equal(
      fs.existsSync(path.join(root, 'desktop', 'src', moduleName)),
      true,
      `${moduleName} should exist`,
    );
  }

  const html = read('desktop/index.html');
  assert.match(html, /<script type="module" src="\.\/src\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /src="\.\/src\/main\.js"/);

  for (const stylesheet of ['base.css', 'accounts.css', 'settings.css', 'dialogs.css', 'responsive.css', 'theme.css']) {
    assert.equal(
      fs.existsSync(path.join(root, 'desktop', 'src', 'styles', stylesheet)),
      true,
      `${stylesheet} should exist`,
    );
  }
});

test('local release installers are ignored', () => {
  assert.match(read('.gitignore'), /^release-assets\/$/m);
});

test('Node service mounts desktop management routes from a focused module', () => {
  assert.equal(fs.existsSync(path.join(root, 'app', 'admin', 'admin-api.js')), true);
  const server = read('openai.js');
  assert.match(server, /createAdminApiRouter/);
  assert.doesNotMatch(server, /app\.get\('\/admin\/api\/configs'/);
  assert.doesNotMatch(server, /admin\/api\/open-external/);
});

test('Node service modules are grouped by domain', () => {
  const expectedModules = {
    accounts: [
      'account-label.js',
      'account-manager.js',
      'openai-token-refresh.js',
    ],
    admin: ['admin-api.js'],
    config: ['config-editor.js', 'openai-config.js', 'runtime-config-reconciler.js'],
    http: ['proxy-header-overrides.js', 'upstream-request.js'],
    protocols: [
      'claude-messages-handler.js',
      'claude-responses-compat.js',
      'responses-defaults.js',
      'responses-failover.js',
    ],
    security: ['request-auth.js'],
  };

  for (const [directory, modules] of Object.entries(expectedModules)) {
    for (const moduleName of modules) {
      assert.equal(
        fs.existsSync(path.join(root, 'app', directory, moduleName)),
        true,
        `${directory}/${moduleName} should exist`,
      );
    }
  }

  const rootModules = fs.readdirSync(path.join(root, 'app'))
    .filter(entry => entry.endsWith('.js'));
  assert.deepEqual(rootModules, []);
});

test('quota history persistence is removed from the desktop-only product', () => {
  assert.equal(
    fs.existsSync(path.join(root, 'app', 'accounts', 'quota-history-store.js')),
    false,
  );
  assert.doesNotMatch(read('openai.js'), /quota-history|QuotaHistor/);
  assert.doesNotMatch(read('app/accounts/account-manager.js'), /quotaHistory|persistQuotaHistory/);
});

test('tests are grouped by responsibility', () => {
  const expectedTests = {
    accounts: [
      'account-manager.test.js',
      'openai-token-refresh.test.js',
    ],
    architecture: ['release-workflow.test.js', 'repository-boundary.test.js'],
    config: ['config-editor.test.js', 'runtime-config-reconciler.test.js'],
    desktop: ['desktop-boot.test.js'],
    http: ['upstream-request.test.js'],
    integration: ['openai-admin-refresh.test.js', 'proxy-boundary.test.js', 'run.test.js'],
    protocols: [
      'claude-code-config.test.js',
      'responses-defaults.test.js',
      'responses-failover.test.js',
    ],
    security: ['request-auth.test.js'],
  };

  for (const [directory, tests] of Object.entries(expectedTests)) {
    for (const testFile of tests) {
      assert.equal(
        fs.existsSync(path.join(root, 'test', directory, testFile)),
        true,
        `${directory}/${testFile} should exist`,
      );
    }
  }

  const rootTests = fs.readdirSync(path.join(root, 'test'))
    .filter(entry => entry.endsWith('.test.js'));
  assert.deepEqual(rootTests, []);
});
