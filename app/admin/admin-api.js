const express = require('express');

function createAdminApiRouter(deps) {
    const {
        ConfigEditorError,
        activateConfigAdminResponse,
        addConfigItem,
        applyProxyEnvironment,
        buildConfigAdminResponse,
        buildImportedConfigItem,
        configFile,
        deleteConfigItem,
        generateRandomSecret,
        getConfiguredApiKeys,
        getRuntimePort,
        handleConfigMutation,
        normalizeRuntimePort,
        parseConfigIndex,
        parseConfigItemJson,
        persistAndReloadConfig,
        persistConfigWithoutRuntimeReload,
        quotaCheckTimeoutMs,
        readParsedConfigFile,
        refreshConfigAdminResponse,
        refreshOpenAIToken,
        refreshSingleConfigAdminResponse,
        scheduleRuntimeNetworkSettings,
        updateConfigItem,
        updateConfigSettings,
        updateConfigSortOrder,
        validateConfigItemBeforeAdd,
    } = deps;
    const router = express.Router();

router.get('/configs', (req, res) => {
    try {
        res.json(buildConfigAdminResponse());
    } catch (err) {
        res.status(500).json({
            error: '读取配置失败',
            details: err.message
        });
    }
});

router.post('/configs/refresh', async (req, res) => {
    try {
        res.json(await refreshConfigAdminResponse());
    } catch (err) {
        res.status(500).json({
            error: '刷新额度失败',
            details: err.message
        });
    }
});

router.post('/configs/:index/refresh', async (req, res) => {
    try {
        const targetIndex = parseConfigIndex(req.params.index);
        res.json(await refreshSingleConfigAdminResponse(targetIndex));
    } catch (err) {
        const statusCode = err instanceof ConfigEditorError ? 400 : 500;
        res.status(statusCode).json({
            error: statusCode === 400 ? '账号刷新失败' : '刷新额度失败',
            details: err.message
        });
    }
});

router.post('/openai/refresh-token', async (req, res) => {
    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const refreshToken = typeof body.refresh_token === 'string' && body.refresh_token.trim()
            ? body.refresh_token.trim()
            : typeof body.rt === 'string' ? body.rt.trim() : '';
        const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : '';

        if (!refreshToken) {
            throw new ConfigEditorError('refresh_token is required');
        }

        res.json(await refreshOpenAIToken({
            refreshToken,
            clientId,
            timeoutMs: quotaCheckTimeoutMs
        }));
    } catch (err) {
        const statusCode = err instanceof ConfigEditorError ? 400 : 502;
        res.status(statusCode).json({
            error: statusCode === 400 ? '参数错误' : 'OpenAI token 刷新失败',
            details: err.message
        });
    }
});

router.post('/configs/:index/activate', async (req, res) => {
    try {
        const targetIndex = parseConfigIndex(req.params.index);
        res.json(await activateConfigAdminResponse(targetIndex));
    } catch (err) {
        const statusCode = err instanceof ConfigEditorError ? 400 : 500;
        res.status(statusCode).json({
            error: statusCode === 400 ? '账号切换失败' : '配置更新失败',
            details: err.message
        });
    }
});

router.patch('/configs/:index', async (req, res) => {
    try {
        const parsed = readParsedConfigFile(configFile);
        const targetIndex = parseConfigIndex(req.params.index);
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const currentItem = parsed.configs[targetIndex];

        if (!currentItem) {
            throw new ConfigEditorError('配置项不存在');
        }

        const nextItem = {
            ...currentItem,
        };

        if (Object.prototype.hasOwnProperty.call(body, 'alias')) {
            nextItem.alias = typeof body.alias === 'string' ? body.alias.trim() : '';
        }

        if (Object.prototype.hasOwnProperty.call(body, 'price_yuan')) {
            nextItem.price_yuan = body.price_yuan;
        }

        if (Object.prototype.hasOwnProperty.call(body, 'started_at')) {
            nextItem.started_at = body.started_at;
        }

        if (Object.prototype.hasOwnProperty.call(body, 'stopped_at')) {
            nextItem.stopped_at = body.stopped_at;
        }

        const hasDeletedAt = Object.prototype.hasOwnProperty.call(body, 'deleted_at');
        if (hasDeletedAt) {
            nextItem.deleted_at = body.deleted_at;
        }

        const hasAutoSwitchDisabled = Object.prototype.hasOwnProperty.call(body, 'auto_switch_disabled');
        if (hasAutoSwitchDisabled) {
            if (typeof body.auto_switch_disabled !== 'boolean') {
                throw new ConfigEditorError('auto_switch_disabled 必须是布尔值');
            }

            nextItem.auto_switch_disabled = body.auto_switch_disabled;
        }

        const nextParsed = updateConfigItem(parsed, targetIndex, nextItem);
        if (hasAutoSwitchDisabled || hasDeletedAt) {
            await persistAndReloadConfig(nextParsed, 'admin_update_config', {
                skipQuotaRefresh: true
            });
        } else {
            persistConfigWithoutRuntimeReload(nextParsed);
        }
        res.status(200).json(buildConfigAdminResponse());
    } catch (err) {
        const statusCode = err instanceof ConfigEditorError ? 400 : 500;
        res.status(statusCode).json({
            error: statusCode === 400 ? '配置更新失败' : '配置更新失败',
            details: err.message
        });
    }
});

router.post('/configs', async (req, res) => {
    try {
        const parsed = readParsedConfigFile(configFile);
        const rawItem = parseConfigItemJson(req.body && req.body.raw_json);
        const configType = req.body && typeof req.body.config_type === 'string'
            ? req.body.config_type.trim()
            : '';
        const inputItem = configType
            ? buildImportedConfigItem(configType, rawItem)
            : buildImportedConfigItem(rawItem);
        const validatedRuntimeConfig = await validateConfigItemBeforeAdd(null, inputItem);
        const nextParsed = addConfigItem(parsed, inputItem);
        await persistAndReloadConfig(nextParsed, 'admin_create', {
            runtimeOverrides: [validatedRuntimeConfig],
            skipQuotaRefresh: true
        });
        res.status(201).json(buildConfigAdminResponse());
    } catch (err) {
        const statusCode = err instanceof ConfigEditorError ? 400 : 500;
        res.status(statusCode).json({
            error: statusCode === 400 ? '配置新增失败' : '配置更新失败',
            details: err.message
        });
    }
});

router.post('/configs/order', async (req, res) => {
    try {
        const parsed = readParsedConfigFile(configFile);
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const nextParsed = updateConfigSortOrder(parsed, body.ordered_indexes);

        persistConfigWithoutRuntimeReload(nextParsed);
        res.status(200).json(buildConfigAdminResponse());
    } catch (err) {
        const statusCode = err instanceof ConfigEditorError ? 400 : 500;
        res.status(statusCode).json({
            error: statusCode === 400 ? '配置排序失败' : '配置更新失败',
            details: err.message
        });
    }
});

router.post('/apikeys', async (req, res) => {
    try {
        const parsed = readParsedConfigFile(configFile);
        const generatedApiKey = generateRandomSecret('sk-ai-cockpit-');
        const nextParsed = updateConfigSettings(parsed, {
            apikeys: [...getConfiguredApiKeys(parsed), generatedApiKey]
        });

        persistConfigWithoutRuntimeReload(nextParsed);
        res.status(201).json({
            ...buildConfigAdminResponse(),
            generated_apikey: generatedApiKey
        });
    } catch (err) {
        const statusCode = err instanceof ConfigEditorError ? 400 : 500;
        res.status(statusCode).json({
            error: statusCode === 400 ? 'apikey 新增失败' : '配置更新失败',
            details: err.message
        });
    }
});

router.delete('/apikeys/:index', async (req, res) => {
    try {
        const parsed = readParsedConfigFile(configFile);
        const apikeys = getConfiguredApiKeys(parsed);
        const targetIndex = parseConfigIndex(req.params.index);

        if (targetIndex >= apikeys.length) {
            throw new ConfigEditorError('apikey 索引不合法');
        }

        persistConfigWithoutRuntimeReload(updateConfigSettings(parsed, {
            apikeys: apikeys.filter((_, index) => index !== targetIndex)
        }));
        res.status(200).json(buildConfigAdminResponse());
    } catch (err) {
        const statusCode = err instanceof ConfigEditorError ? 400 : 500;
        res.status(statusCode).json({
            error: statusCode === 400 ? 'apikey 删除失败' : '配置更新失败',
            details: err.message
        });
    }
});

router.post('/settings', async (req, res) => {
    try {
        const parsed = readParsedConfigFile(configFile);
        const previousPort = getRuntimePort();
        const settings = {};
        const body = req.body && typeof req.body === 'object' ? req.body : {};

        for (const field of ['port', 'proxy_port', 'routing_preference', 'responses']) {
            if (Object.prototype.hasOwnProperty.call(body, field)) {
                settings[field] = body[field];
            }
        }

        const nextParsed = updateConfigSettings(parsed, settings);

        await persistAndReloadConfig(nextParsed, 'admin_update_settings', {
            skipQuotaRefresh: true
        });

        const nextPort = normalizeRuntimePort(nextParsed.port, getRuntimePort());
        if (nextPort === previousPort) {
            applyProxyEnvironment(nextParsed.proxy_port);
        }

        const responseBody = {
            ...buildConfigAdminResponse(),
            network_settings: {
                applied_immediately: true,
                previous_port: previousPort,
                next_port: nextPort,
                port_changed: nextPort !== previousPort,
                proxy_port: nextParsed.proxy_port ?? null
            }
        };

        res.status(200).json(responseBody);
        if (nextPort !== previousPort) {
            scheduleRuntimeNetworkSettings(nextParsed, previousPort);
        }
    } catch (err) {
        const statusCode = err instanceof ConfigEditorError ? 400 : 500;
        res.status(statusCode).json({
            error: statusCode === 400 ? '配置设置更新失败' : '配置更新失败',
            details: err.message
        });
    }
});

router.delete('/configs/:index', async (req, res) => {
    await handleConfigMutation(
        res,
        parsed => deleteConfigItem(parsed, parseConfigIndex(req.params.index)),
        'admin_delete',
        200,
        {
            skipQuotaRefresh: true
        }
    );
});

    return router;
}

module.exports = { createAdminApiRouter };

