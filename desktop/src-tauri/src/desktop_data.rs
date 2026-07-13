use crate::runtime::*;
use crate::*;

pub(crate) fn parse_port(value: Option<Value>) -> Option<u16> {
    match value? {
        Value::Number(number) => number.as_u64().and_then(|port| u16::try_from(port).ok()),
        Value::String(text) => text.trim().parse::<u16>().ok(),
        _ => None,
    }
}

fn parse_required_port(value: Value, fallback: u16, label: &str) -> Result<u16, String> {
    if matches!(&value, Value::String(text) if text.trim().is_empty()) {
        return Ok(fallback);
    }
    parse_port(Some(value))
        .filter(|port| *port > 0)
        .ok_or_else(|| format!("{label}必须是 1-65535 之间的端口号"))
}

pub(crate) fn read_config(runtime_dir: &Path) -> Result<ConfigShape, String> {
    let raw = fs::read_to_string(runtime_dir.join(CONFIG_FILE))
        .map_err(|error| format!("无法读取 openai.json: {error}"))?;
    serde_json::from_str(&raw).map_err(|error| format!("openai.json 解析失败: {error}"))
}

pub(crate) fn read_desktop_config_map(runtime_dir: &Path) -> Result<Map<String, Value>, String> {
    let config_path = runtime_dir.join(CONFIG_FILE);
    let raw = if config_path.exists() {
        fs::read_to_string(&config_path)
            .map_err(|error| format!("无法读取 {}: {error}", config_path.display()))?
    } else {
        let template_path = runtime_dir.join(CONFIG_TEMPLATE_FILE);
        if template_path.exists() {
            fs::read_to_string(&template_path)
                .map_err(|error| format!("无法读取 {}: {error}", template_path.display()))?
        } else {
            r#"{"apikeys":[],"port":3009,"configs":[]}"#.to_string()
        }
    };

    let parsed: Value =
        serde_json::from_str(&raw).map_err(|error| format!("openai.json 解析失败: {error}"))?;
    let mut config = parsed
        .as_object()
        .cloned()
        .ok_or_else(|| "openai.json 必须是 JSON 对象".to_string())?;
    ensure_desktop_config_defaults(&mut config);
    Ok(config)
}

pub(crate) fn ensure_desktop_config_defaults(config: &mut Map<String, Value>) {
    if !config.get("apikeys").is_some_and(Value::is_array) {
        config.insert("apikeys".to_string(), Value::from(Vec::<Value>::new()));
    }
    if !config.get("configs").is_some_and(Value::is_array) {
        config.insert("configs".to_string(), Value::from(Vec::<Value>::new()));
    }
    if !config.contains_key("port") {
        config.insert("port".to_string(), Value::from(DEFAULT_PORT));
    }
}

pub(crate) fn write_desktop_config_map(
    runtime_dir: &Path,
    config: &Map<String, Value>,
) -> Result<(), String> {
    let config_path = runtime_dir.join(CONFIG_FILE);
    let rendered = serde_json::to_string_pretty(&Value::Object(config.clone()))
        .map_err(|error| format!("无法生成 openai.json: {error}"))?;
    fs::write(&config_path, format!("{rendered}\n"))
        .map_err(|error| format!("无法写入 {}: {error}", config_path.display()))
}

pub(crate) fn parse_bool_setting(value: Option<&Value>, fallback: bool) -> bool {
    match value {
        Some(Value::Bool(value)) => *value,
        Some(Value::String(value)) => match value.trim().to_ascii_lowercase().as_str() {
            "true" | "1" | "yes" => true,
            "false" | "0" | "no" => false,
            _ => fallback,
        },
        _ => fallback,
    }
}

pub(crate) fn parse_routing_preference(value: Option<&Value>) -> String {
    let preference = value
        .and_then(Value::as_str)
        .unwrap_or("token_first")
        .trim()
        .to_string();
    match preference.as_str() {
        "token_first" | "apikey_first" | "token_only" | "apikey_only" => preference,
        _ => "token_first".to_string(),
    }
}

pub(crate) fn apply_desktop_settings_to_config(
    config: &mut Map<String, Value>,
    settings: &SaveDesktopSettingsRequest,
) -> Result<(), String> {
    if let Some(port_value) = settings.port.clone() {
        let port = parse_required_port(port_value, DEFAULT_PORT, "服务端口")?;
        config.insert("port".to_string(), Value::from(port));
    }

    match settings.proxy_port.clone() {
        Some(Value::Null) | None => {
            config.remove("proxy_port");
        }
        Some(proxy_value) => {
            let proxy_port = parse_required_port(proxy_value, DEFAULT_PORT, "代理端口")?;
            config.insert("proxy_port".to_string(), Value::from(proxy_port));
        }
    }

    if let Some(preference) = settings.routing_preference.clone() {
        let preference = parse_routing_preference(Some(&Value::String(preference)));
        config.insert("routing_preference".to_string(), Value::String(preference));
    }

    if let Some(auto_switch) = settings.auto_switch {
        config.insert("auto_switch".to_string(), Value::Bool(auto_switch));
    }

    Ok(())
}

pub(crate) fn desktop_settings_from_config(config: &Map<String, Value>) -> DesktopSettings {
    DesktopSettings {
        port: parse_port(config.get("port").cloned()).unwrap_or(DEFAULT_PORT),
        proxy_port: parse_port(config.get("proxy_port").cloned()),
        routing_preference: parse_routing_preference(config.get("routing_preference")),
        auto_switch: parse_bool_setting(config.get("auto_switch"), true),
    }
}

pub(crate) fn desktop_settings_admin_body(config: &Map<String, Value>) -> Value {
    let settings = desktop_settings_from_config(config);
    serde_json::json!({
        "port": settings.port,
        "proxy_port": settings.proxy_port,
        "routing_preference": settings.routing_preference,
    })
}

pub(crate) fn desktop_accounts_from_config(config: &Map<String, Value>) -> Vec<DesktopAccount> {
    let active_index = config
        .get("active_config_index")
        .and_then(Value::as_u64)
        .and_then(|value| usize::try_from(value).ok());
    let runtimes = config
        .get("config_runtimes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    config
        .get("configs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .map(|(index, item)| DesktopAccount {
            index,
            item,
            runtime: runtimes.get(index).cloned().unwrap_or_else(|| {
                let mut runtime = Map::new();
                runtime.insert("available".to_string(), Value::Bool(true));
                runtime.insert("reason".to_string(), Value::String("unchecked".to_string()));
                Value::Object(runtime)
            }),
            is_active: active_index == Some(index),
        })
        .collect()
}

pub(crate) fn desktop_accounts_from_admin_snapshot(snapshot: &Value) -> Vec<DesktopAccount> {
    snapshot
        .get("configs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .filter_map(|(fallback_index, entry)| {
            let object = entry.as_object()?;
            let index = object
                .get("index")
                .and_then(Value::as_u64)
                .and_then(|value| usize::try_from(value).ok())
                .unwrap_or(fallback_index);
            Some(DesktopAccount {
                index,
                item: object.get("item").cloned().unwrap_or(Value::Null),
                runtime: object.get("runtime").cloned().unwrap_or(Value::Null),
                is_active: object
                    .get("is_active")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            })
        })
        .collect()
}

pub(crate) fn mask_secret(value: &str) -> String {
    let text = value.trim();
    if text.is_empty() {
        return "-".to_string();
    }
    if text.len() <= 10 {
        return "***".to_string();
    }
    format!("{}...{}", &text[..4], &text[text.len() - 4..])
}

pub(crate) fn desktop_access_tokens_from_config(
    config: &Map<String, Value>,
) -> Vec<DesktopAccessToken> {
    let names = config
        .get("desktop_access_token_names")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    config
        .get("apikeys")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .filter_map(|(index, token)| {
            let token = token.as_str()?.to_string();
            let name = names
                .get(index)
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| format!("令牌 #{}", index + 1));
            Some(DesktopAccessToken {
                index,
                masked: mask_secret(&token),
                token,
                name,
            })
        })
        .collect()
}

pub(crate) fn build_desktop_snapshot_static(
    runtime_dir: PathBuf,
) -> Result<DesktopSnapshot, String> {
    let config = read_desktop_config_map(&runtime_dir)?;
    Ok(DesktopSnapshot {
        service: status_for_runtime(runtime_dir),
        settings: desktop_settings_from_config(&config),
        accounts: desktop_accounts_from_config(&config),
        access_tokens: desktop_access_tokens_from_config(&config),
    })
}

pub(crate) fn build_desktop_snapshot_from_admin(
    runtime_dir: PathBuf,
    admin_snapshot: Value,
) -> Result<DesktopSnapshot, String> {
    let config = read_desktop_config_map(&runtime_dir)?;
    Ok(DesktopSnapshot {
        service: status_for_runtime(runtime_dir),
        settings: desktop_settings_from_config(&config),
        accounts: desktop_accounts_from_admin_snapshot(&admin_snapshot),
        access_tokens: desktop_access_tokens_from_config(&config),
    })
}

pub(crate) fn admin_api_url(runtime_dir: &Path, api_path: &str) -> Result<String, String> {
    let config = read_config(runtime_dir)?;
    let port = parse_port(config.port).unwrap_or(DEFAULT_PORT);
    admin_api_url_with_port(runtime_dir, api_path, port)
}

pub(crate) fn admin_api_url_with_port(
    runtime_dir: &Path,
    api_path: &str,
    port: u16,
) -> Result<String, String> {
    let config = read_config(runtime_dir)?;
    let base = format!("http://localhost:{port}{api_path}");
    Ok(
        match config.auth_token.filter(|token| !token.trim().is_empty()) {
            Some(token) => format!("{base}?auth_token={token}"),
            None => base,
        },
    )
}

pub(crate) fn call_admin_api_with_url(
    app: &AppHandle,
    runtime_dir: &Path,
    url: String,
    method: &str,
    body: Option<Value>,
) -> Result<Value, String> {
    let node = node_sidecar_path(app)?;
    let body_text = body.map(|value| value.to_string()).unwrap_or_default();
    let script = r#"
const [url, method, body] = process.argv.slice(1);
const options = {
  method,
  headers: body ? { 'content-type': 'application/json' } : undefined,
  body: body || undefined
};
fetch(url, options).then(async response => {
  const text = await response.text();
  if (!response.ok) {
    console.error(text || `${response.status} ${response.statusText}`);
    process.exit(1);
  }
  process.stdout.write(text || '{}');
}).catch(error => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
"#;
    let mut command = Command::new(node);
    let output = hide_command_window(&mut command)
        .current_dir(runtime_dir)
        .arg("-e")
        .arg(script)
        .arg(url)
        .arg(method)
        .arg(body_text)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("调用本地服务失败: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("本地服务接口调用失败: {stderr}"));
    }

    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("本地服务返回无效 JSON: {error}"))
}

pub(crate) fn call_admin_api(
    app: &AppHandle,
    runtime_dir: &Path,
    api_path: &str,
    method: &str,
    body: Option<Value>,
) -> Result<Value, String> {
    let url = admin_api_url(runtime_dir, api_path)?;
    call_admin_api_with_url(app, runtime_dir, url, method, body)
}

pub(crate) fn call_admin_api_on_port(
    app: &AppHandle,
    runtime_dir: &Path,
    port: u16,
    api_path: &str,
    method: &str,
    body: Option<Value>,
) -> Result<Value, String> {
    let url = admin_api_url_with_port(runtime_dir, api_path, port)?;
    call_admin_api_with_url(app, runtime_dir, url, method, body)
}

pub(crate) fn build_desktop_snapshot(
    app: &AppHandle,
    runtime_dir: PathBuf,
) -> Result<DesktopSnapshot, String> {
    let status = status_for_runtime(runtime_dir.clone());
    if status.running {
        if let Ok(admin_snapshot) =
            call_admin_api(app, &runtime_dir, "/admin/api/configs", "GET", None)
        {
            return build_desktop_snapshot_from_admin(runtime_dir, admin_snapshot);
        }
    }
    build_desktop_snapshot_static(runtime_dir)
}

pub(crate) async fn run_snapshot_task<F>(task: F) -> Result<DesktopSnapshot, String>
where
    F: FnOnce() -> Result<DesktopSnapshot, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("后台任务失败: {error}"))?
}

pub(crate) fn value_object(value: &Value) -> Result<&Map<String, Value>, String> {
    value
        .as_object()
        .ok_or_else(|| "请求必须是 JSON 对象".to_string())
}

pub(crate) fn string_field(object: &Map<String, Value>, key: &str) -> Option<String> {
    object
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub(crate) fn number_field(object: &Map<String, Value>, key: &str) -> Option<Value> {
    let value = object.get(key)?;
    match value {
        Value::Null => None,
        Value::Number(_) => Some(value.clone()),
        Value::String(text) => {
            let text = text.trim();
            if text.is_empty() {
                None
            } else if let Ok(parsed) = text.parse::<f64>() {
                Some(Value::from(parsed))
            } else {
                None
            }
        }
        _ => None,
    }
}

pub(crate) fn set_optional_string(
    object: &mut Map<String, Value>,
    key: &str,
    value: Option<String>,
) {
    match value {
        Some(value) if !value.trim().is_empty() => {
            object.insert(key.to_string(), Value::String(value));
        }
        _ => {
            object.remove(key);
        }
    }
}

pub(crate) fn set_optional_value(object: &mut Map<String, Value>, key: &str, value: Option<Value>) {
    match value {
        Some(value) => {
            object.insert(key.to_string(), value);
        }
        None => {
            object.remove(key);
        }
    }
}

pub(crate) fn configs_mut(config: &mut Map<String, Value>) -> Result<&mut Vec<Value>, String> {
    ensure_desktop_config_defaults(config);
    config
        .get_mut("configs")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "配置文件 configs 必须是数组".to_string())
}

pub(crate) fn next_sort_order(configs: &[Value]) -> usize {
    configs
        .iter()
        .filter_map(|item| item.get("sort_order"))
        .filter_map(|value| {
            value.as_u64().or_else(|| {
                value
                    .as_str()
                    .and_then(|text| text.trim().parse::<u64>().ok())
            })
        })
        .max()
        .and_then(|value| usize::try_from(value).ok())
        .unwrap_or(configs.len())
        + 10
}

pub(crate) fn build_new_desktop_account(
    request: &Map<String, Value>,
    sort_order: usize,
) -> Result<Value, String> {
    let mode = string_field(request, "mode").unwrap_or_else(|| "token".to_string());
    let mut item = Map::new();

    if mode == "apikey" {
        let base_url =
            string_field(request, "base_url").ok_or_else(|| "Base URL 必填".to_string())?;
        let apikey = string_field(request, "apikey").ok_or_else(|| "API Key 必填".to_string())?;
        item.insert("type".to_string(), Value::String("apikey".to_string()));
        item.insert("base_url".to_string(), Value::String(base_url));
        item.insert("apikey".to_string(), Value::String(apikey));
        item.insert("support".to_string(), Value::from(vec!["gpt"]));
        set_optional_string(&mut item, "alias", string_field(request, "alias"));
        set_optional_string(
            &mut item,
            "description",
            string_field(request, "description"),
        );
    } else {
        let access_token =
            string_field(request, "access_token").ok_or_else(|| "access_token 必填".to_string())?;
        item.insert("access_token".to_string(), Value::String(access_token));
        set_optional_string(
            &mut item,
            "description",
            string_field(request, "description"),
        );
        set_optional_string(&mut item, "alias", string_field(request, "alias"));
        set_optional_string(&mut item, "account_id", string_field(request, "account_id"));
        set_optional_string(&mut item, "client_id", string_field(request, "client_id"));
        set_optional_string(
            &mut item,
            "refresh_token",
            string_field(request, "refresh_token"),
        );
    }

    set_optional_value(&mut item, "price_yuan", number_field(request, "price_yuan"));
    set_optional_string(&mut item, "started_at", string_field(request, "started_at"));
    set_optional_string(&mut item, "stopped_at", string_field(request, "stopped_at"));
    item.insert("sort_order".to_string(), Value::from(sort_order));
    Ok(Value::Object(item))
}

pub(crate) fn desktop_account_reload_body(account: &Value) -> Value {
    let auto_switch_disabled = account
        .get("auto_switch_disabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    Value::Object(Map::from_iter([(
        "auto_switch_disabled".to_string(),
        Value::Bool(auto_switch_disabled),
    )]))
}

pub(crate) fn apply_desktop_account_edit(
    configs: &mut [Value],
    request: &Map<String, Value>,
) -> Result<(), String> {
    let index = request
        .get("index")
        .and_then(Value::as_u64)
        .and_then(|value| usize::try_from(value).ok())
        .ok_or_else(|| "缺少账号索引".to_string())?;
    let item = configs
        .get_mut(index)
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "未找到要编辑的账号".to_string())?;

    let account_type = string_field(request, "type")
        .or_else(|| item.get("type").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_else(|| "token".to_string());

    if account_type == "apikey" {
        let base_url =
            string_field(request, "base_url").ok_or_else(|| "Base URL 必填".to_string())?;
        let apikey = string_field(request, "apikey").ok_or_else(|| "API Key 必填".to_string())?;
        item.insert("type".to_string(), Value::String("apikey".to_string()));
        item.insert("base_url".to_string(), Value::String(base_url));
        item.insert("apikey".to_string(), Value::String(apikey));
        item.insert("support".to_string(), Value::from(vec!["gpt"]));
        set_optional_string(item, "description", string_field(request, "description"));
    } else {
        let access_token =
            string_field(request, "access_token").ok_or_else(|| "access_token 必填".to_string())?;
        item.remove("type");
        item.insert("access_token".to_string(), Value::String(access_token));
        set_optional_string(item, "description", string_field(request, "description"));
        set_optional_string(item, "account_id", string_field(request, "account_id"));
        set_optional_string(item, "client_id", string_field(request, "client_id"));
        set_optional_string(
            item,
            "refresh_token",
            string_field(request, "refresh_token"),
        );
    }

    set_optional_string(item, "alias", string_field(request, "alias"));
    set_optional_value(item, "price_yuan", number_field(request, "price_yuan"));
    set_optional_string(item, "started_at", string_field(request, "started_at"));
    set_optional_string(item, "stopped_at", string_field(request, "stopped_at"));
    Ok(())
}
