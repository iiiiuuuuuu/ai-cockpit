const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  buildAgentAssertion,
  buildSub2ApiAuthHeaders,
  createSub2ApiAgentIdentityManager,
  isSub2ApiTaskInvalidResponse,
  isSub2ApiConfig,
  normalizeSub2ApiCredentials,
  parseAgentPrivateKey,
} = require('../../app/accounts/sub2api-agent-identity');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const agentPrivateKey = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const validCredentials = {
  auth_mode: 'agentIdentity',
  agent_runtime_id: 'runtime-1',
  agent_private_key: agentPrivateKey,
  task_id: 'task-1',
  chatgpt_account_id: 'account-1',
  chatgpt_user_id: 'user-1',
  email: 'user@example.com',
  plan_type: 'team',
};
const config = {
  type: 'token',
  subtype: 'sub2api',
  credentials: validCredentials,
};

test('识别完整的 Sub2API Agent Identity 配置', () => {
  assert.equal(isSub2ApiConfig(config), true);
  assert.equal(isSub2ApiConfig({ type: 'token', credentials: validCredentials }), false);
  assert.equal(isSub2ApiConfig({ type: 'apikey', subtype: 'sub2api', credentials: validCredentials }), false);
});

test('使用 Ed25519 私钥生成可验证的 AgentAssertion', () => {
  const assertion = buildAgentAssertion(config, { now: 0 });
  const encodedPayload = assertion.split(' ')[1];
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  const signedContent = Buffer.from(`runtime-1:task-1:${payload.timestamp}`);

  assert.equal(assertion.startsWith('AgentAssertion '), true);
  assert.equal(payload.agent_runtime_id, 'runtime-1');
  assert.equal(payload.task_id, 'task-1');
  assert.equal(
    crypto.verify(null, signedContent, publicKey, Buffer.from(payload.signature, 'base64')),
    true,
  );
});

test('构造 Responses 和额度检查的不同鉴权请求头', () => {
  const responseHeaders = buildSub2ApiAuthHeaders(config);
  const quotaHeaders = buildSub2ApiAuthHeaders(config, { purpose: 'quota' });

  assert.equal(responseHeaders.authorization.startsWith('AgentAssertion '), true);
  assert.equal(responseHeaders['chatgpt-account-id'], 'account-1');
  assert.equal(responseHeaders.originator, 'codex_cli_rs');
  assert.equal(quotaHeaders.originator, 'Codex Desktop');
  assert.equal(quotaHeaders['openai-beta'], 'codex-1');
});

test('允许缺少 task_id，但拒绝缺少核心字段或非法私钥', () => {
  const normalized = normalizeSub2ApiCredentials({ ...validCredentials, task_id: '' });
  assert.equal(normalized.task_id, undefined);
  assert.doesNotThrow(() => parseAgentPrivateKey(agentPrivateKey));
  assert.throws(
    () => normalizeSub2ApiCredentials({ auth_mode: 'agentIdentity' }),
    /agent_runtime_id/,
  );
  assert.throws(
    () => normalizeSub2ApiCredentials({ ...validCredentials, agent_private_key: 'bad' }),
    /agent_private_key/,
  );
});

test('同一个 Agent Identity 并发确保 task 时只注册一次', async () => {
  const taskConfig = {
    ...config,
    credentials: { ...validCredentials, task_id: '' },
  };
  let registrations = 0;
  const manager = createSub2ApiAgentIdentityManager({
    requestBufferedFn: async request => {
      registrations += 1;
      assert.equal(request.method, 'POST');
      assert.match(request.targetUrl, /\/v1\/agent\/runtime-1\/task\/register$/);
      return { statusCode: 200, bodyText: JSON.stringify({ task_id: 'task-new' }) };
    },
    persistTaskFn: async ({ taskId }) => taskId,
  });

  const taskIds = await Promise.all([
    manager.ensureTask(taskConfig),
    manager.ensureTask(taskConfig),
  ]);

  assert.deepEqual(taskIds, ['task-new', 'task-new']);
  assert.equal(registrations, 1);
  assert.equal(taskConfig.credentials.task_id, 'task-new');
});

test('只识别明确的 task 失效响应', () => {
  assert.equal(isSub2ApiTaskInvalidResponse(401, '{"code":"invalid_task_id"}'), true);
  assert.equal(isSub2ApiTaskInvalidResponse(401, 'task expired'), true);
  assert.equal(isSub2ApiTaskInvalidResponse(401, 'invalid credentials'), false);
  assert.equal(isSub2ApiTaskInvalidResponse(500, 'invalid_task_id'), false);
});
