use crate::desktop_data::*;
use crate::runtime::*;
use crate::service::*;
use crate::*;

pub(crate) fn get_status(app: AppHandle) -> Result<ServiceStatus, String> {
    let runtime_dir = ensure_runtime(&app)?;
    Ok(status_for_runtime(runtime_dir))
}

#[tauri::command]
pub(crate) fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub(crate) async fn open_release_page(url: String) -> Result<(), String> {
    run_native_task(move || open_project_release_url(&url)).await
}

#[tauri::command]
pub(crate) async fn open_account_help_page(url: String) -> Result<(), String> {
    run_native_task(move || open_account_help_url(&url)).await
}

pub(crate) async fn run_native_task<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("桌面后台任务失败: {error}"))?
}

#[tauri::command]
pub(crate) async fn get_desktop_snapshot(app: AppHandle) -> Result<DesktopSnapshot, String> {
    run_snapshot_task(move || {
        let runtime_dir = ensure_runtime(&app)?;
        build_desktop_snapshot(&app, runtime_dir)
    })
    .await
}

#[tauri::command]
pub(crate) async fn save_desktop_settings(
    app: AppHandle,
    settings: SaveDesktopSettingsRequest,
) -> Result<DesktopSnapshot, String> {
    run_snapshot_task(move || {
        let runtime_dir = ensure_runtime(&app)?;
        let mut config = read_desktop_config_map(&runtime_dir)?;
        let previous_port = desktop_settings_from_config(&config).port;
        let service_was_running = status_for_runtime(runtime_dir.clone()).running;

        apply_desktop_settings_to_config(&mut config, &settings)?;
        let next_port = desktop_settings_from_config(&config).port;
        if next_port != previous_port {
            ensure_port_available_for_change(&runtime_dir, next_port)?;
        }
        let admin_body = desktop_settings_admin_body(&config);
        write_desktop_config_map(&runtime_dir, &config)?;

        if service_was_running {
            let admin_snapshot = call_admin_api_on_port(
                &app,
                &runtime_dir,
                previous_port,
                "/admin/api/settings",
                "POST",
                Some(admin_body),
            )?;
            if next_port != previous_port {
                wait_for_managed_service_port(&runtime_dir, next_port, Duration::from_secs(3))?;
            }
            return build_desktop_snapshot_from_admin(runtime_dir, admin_snapshot);
        }

        build_desktop_snapshot(&app, runtime_dir)
    })
    .await
}

#[tauri::command]
pub(crate) async fn save_desktop_account(
    app: AppHandle,
    request: Value,
) -> Result<DesktopSnapshot, String> {
    run_snapshot_task(move || {
        let runtime_dir = ensure_runtime(&app)?;
        let mut config = read_desktop_config_map(&runtime_dir)?;
        let request = value_object(&request)?;
        let configs = configs_mut(&mut config)?;
        let mode = string_field(request, "mode").unwrap_or_else(|| "token".to_string());
        let reload_index;

        if mode == "edit" {
            reload_index = request
                .get("index")
                .and_then(Value::as_u64)
                .and_then(|value| usize::try_from(value).ok())
                .ok_or_else(|| "缺少账号索引".to_string())?;
            apply_desktop_account_edit(configs, request)?;
        } else {
            let sort_order = next_sort_order(configs);
            configs.push(build_new_desktop_account(request, sort_order)?);
            reload_index = configs.len() - 1;
        }

        let reload_body = configs
            .get(reload_index)
            .map(desktop_account_reload_body)
            .ok_or_else(|| "未找到刚保存的账号".to_string())?;
        write_desktop_config_map(&runtime_dir, &config)?;

        if status_for_runtime(runtime_dir.clone()).running {
            let admin_snapshot = call_admin_api(
                &app,
                &runtime_dir,
                &format!("/admin/api/configs/{reload_index}"),
                "PATCH",
                Some(reload_body),
            )?;
            return build_desktop_snapshot_from_admin(runtime_dir, admin_snapshot);
        }

        build_desktop_snapshot(&app, runtime_dir)
    })
    .await
}

#[tauri::command]
pub(crate) async fn import_desktop_accounts(
    app: AppHandle,
    accounts: Vec<Value>,
    update_existing: bool,
) -> Result<DesktopBatchImportResponse, String> {
    run_native_task(move || {
        let runtime_dir = ensure_runtime(&app)?;
        let original_config = read_desktop_config_map(&runtime_dir)?;
        let mut next_config = original_config.clone();
        let summary =
            apply_desktop_batch_import(configs_mut(&mut next_config)?, &accounts, update_existing)?;

        if summary.imported == 0 && summary.updated == 0 {
            return Ok(DesktopBatchImportResponse {
                snapshot: build_desktop_snapshot(&app, runtime_dir)?,
                imported: 0,
                updated: 0,
                skipped: summary.skipped,
            });
        }

        let config_path = runtime_dir.join(CONFIG_FILE);
        let backup_path = runtime_dir.join(format!("{CONFIG_FILE}.import-backup"));
        if config_path.exists() {
            fs::copy(&config_path, &backup_path)
                .map_err(|error| format!("无法备份导入前配置: {error}"))?;
        }
        write_desktop_config_map(&runtime_dir, &next_config)?;

        let snapshot = if status_for_runtime(runtime_dir.clone()).running {
            match call_admin_api(&app, &runtime_dir, "/admin/api/config/reload", "POST", None) {
                Ok(admin_snapshot) => {
                    build_desktop_snapshot_from_admin(runtime_dir.clone(), admin_snapshot)?
                }
                Err(error) => {
                    let _ = write_desktop_config_map(&runtime_dir, &original_config);
                    let _ = call_admin_api(
                        &app,
                        &runtime_dir,
                        "/admin/api/config/reload",
                        "POST",
                        None,
                    );
                    return Err(format!("批量导入失败，已恢复原配置: {error}"));
                }
            }
        } else {
            build_desktop_snapshot(&app, runtime_dir.clone())?
        };

        Ok(DesktopBatchImportResponse {
            snapshot,
            imported: summary.imported,
            updated: summary.updated,
            skipped: summary.skipped,
        })
    })
    .await
}

#[tauri::command]
pub(crate) async fn save_desktop_account_order(
    app: AppHandle,
    ordered_indexes: Vec<usize>,
) -> Result<DesktopSnapshot, String> {
    run_snapshot_task(move || {
        let runtime_dir = ensure_runtime(&app)?;
        if status_for_runtime(runtime_dir.clone()).running {
            let body = serde_json::json!({ "ordered_indexes": ordered_indexes });
            let admin_snapshot = call_admin_api(
                &app,
                &runtime_dir,
                "/admin/api/configs/order",
                "POST",
                Some(body),
            )?;
            return build_desktop_snapshot_from_admin(runtime_dir, admin_snapshot);
        }

        let mut config = read_desktop_config_map(&runtime_dir)?;
        apply_desktop_account_order(configs_mut(&mut config)?, &ordered_indexes)?;
        write_desktop_config_map(&runtime_dir, &config)?;
        build_desktop_snapshot(&app, runtime_dir)
    })
    .await
}

#[tauri::command]
pub(crate) async fn activate_desktop_account(
    app: AppHandle,
    index: usize,
) -> Result<DesktopSnapshot, String> {
    run_snapshot_task(move || {
        let runtime_dir = ensure_runtime(&app)?;
        let admin_snapshot = call_admin_api(
            &app,
            &runtime_dir,
            &format!("/admin/api/configs/{index}/activate"),
            "POST",
            None,
        )?;
        build_desktop_snapshot_from_admin(runtime_dir, admin_snapshot)
    })
    .await
}

#[tauri::command]
pub(crate) async fn refresh_desktop_account(
    app: AppHandle,
    index: usize,
) -> Result<DesktopSnapshot, String> {
    run_snapshot_task(move || {
        let runtime_dir = ensure_runtime(&app)?;
        let admin_snapshot = call_admin_api(
            &app,
            &runtime_dir,
            &format!("/admin/api/configs/{index}/refresh"),
            "POST",
            None,
        )?;
        build_desktop_snapshot_from_admin(runtime_dir, admin_snapshot)
    })
    .await
}

#[tauri::command]
pub(crate) async fn toggle_desktop_account_auto_switch(
    app: AppHandle,
    index: usize,
    disabled: bool,
) -> Result<DesktopSnapshot, String> {
    run_snapshot_task(move || {
        let runtime_dir = ensure_runtime(&app)?;
        let body = Value::Object(Map::from_iter([(
            "auto_switch_disabled".to_string(),
            Value::Bool(disabled),
        )]));
        let admin_snapshot = call_admin_api(
            &app,
            &runtime_dir,
            &format!("/admin/api/configs/{index}"),
            "PATCH",
            Some(body),
        )?;
        build_desktop_snapshot_from_admin(runtime_dir, admin_snapshot)
    })
    .await
}

#[tauri::command]
pub(crate) async fn restore_desktop_account(
    app: AppHandle,
    index: usize,
) -> Result<DesktopSnapshot, String> {
    run_snapshot_task(move || {
        let runtime_dir = ensure_runtime(&app)?;
        let mut config = read_desktop_config_map(&runtime_dir)?;
        let sort_order = restore_desktop_account_at_end(configs_mut(&mut config)?, index)?;
        let body = serde_json::json!({
            "deleted_at": Value::Null,
            "sort_order": sort_order,
        });

        if status_for_runtime(runtime_dir.clone()).running {
            let admin_snapshot = call_admin_api(
                &app,
                &runtime_dir,
                &format!("/admin/api/configs/{index}"),
                "PATCH",
                Some(body),
            )?;
            return build_desktop_snapshot_from_admin(runtime_dir, admin_snapshot);
        }

        write_desktop_config_map(&runtime_dir, &config)?;
        build_desktop_snapshot(&app, runtime_dir)
    })
    .await
}

#[tauri::command]
pub(crate) async fn mark_desktop_account_deleted(
    app: AppHandle,
    index: usize,
    deleted_at: String,
) -> Result<DesktopSnapshot, String> {
    run_snapshot_task(move || {
        let runtime_dir = ensure_runtime(&app)?;
        let body = Value::Object(Map::from_iter([(
            "deleted_at".to_string(),
            Value::String(deleted_at),
        )]));
        if status_for_runtime(runtime_dir.clone()).running {
            let admin_snapshot = call_admin_api(
                &app,
                &runtime_dir,
                &format!("/admin/api/configs/{index}"),
                "PATCH",
                Some(body),
            )?;
            return build_desktop_snapshot_from_admin(runtime_dir, admin_snapshot);
        }

        let mut config = read_desktop_config_map(&runtime_dir)?;
        let configs = configs_mut(&mut config)?;
        let item = configs
            .get_mut(index)
            .and_then(Value::as_object_mut)
            .ok_or_else(|| "未找到要删除的账号".to_string())?;
        if let Some(value) = body.get("deleted_at").cloned() {
            item.insert("deleted_at".to_string(), value);
        }
        write_desktop_config_map(&runtime_dir, &config)?;
        build_desktop_snapshot(&app, runtime_dir)
    })
    .await
}

#[tauri::command]
pub(crate) async fn delete_desktop_account(
    app: AppHandle,
    index: usize,
) -> Result<DesktopSnapshot, String> {
    run_snapshot_task(move || {
        let runtime_dir = ensure_runtime(&app)?;
        if status_for_runtime(runtime_dir.clone()).running {
            let admin_snapshot = call_admin_api(
                &app,
                &runtime_dir,
                &format!("/admin/api/configs/{index}"),
                "DELETE",
                None,
            )?;
            return build_desktop_snapshot_from_admin(runtime_dir, admin_snapshot);
        }

        let mut config = read_desktop_config_map(&runtime_dir)?;
        let configs = configs_mut(&mut config)?;
        if index >= configs.len() {
            return Err("未找到要删除的账号".to_string());
        }
        configs.remove(index);
        write_desktop_config_map(&runtime_dir, &config)?;
        build_desktop_snapshot(&app, runtime_dir)
    })
    .await
}

#[tauri::command]
pub(crate) async fn save_access_token(
    app: AppHandle,
    request: Value,
) -> Result<DesktopSnapshot, String> {
    run_snapshot_task(move || {
        let runtime_dir = ensure_runtime(&app)?;
        let mut config = read_desktop_config_map(&runtime_dir)?;
        ensure_desktop_config_defaults(&mut config);
        let request = value_object(&request)?;
        let token = string_field(request, "token").ok_or_else(|| "令牌必填".to_string())?;
        let name = string_field(request, "name").unwrap_or_default();

        config
            .get_mut("apikeys")
            .and_then(Value::as_array_mut)
            .ok_or_else(|| "配置文件 apikeys 必须是数组".to_string())?
            .push(Value::String(token));

        let names_value = config
            .entry("desktop_access_token_names".to_string())
            .or_insert_with(|| Value::from(Vec::<Value>::new()));
        let names = names_value
            .as_array_mut()
            .ok_or_else(|| "desktop_access_token_names 必须是数组".to_string())?;
        names.push(Value::String(name));

        write_desktop_config_map(&runtime_dir, &config)?;
        build_desktop_snapshot(&app, runtime_dir)
    })
    .await
}

#[tauri::command]
pub(crate) async fn delete_access_token(
    app: AppHandle,
    index: usize,
) -> Result<DesktopSnapshot, String> {
    run_snapshot_task(move || {
        let runtime_dir = ensure_runtime(&app)?;
        let mut config = read_desktop_config_map(&runtime_dir)?;
        ensure_desktop_config_defaults(&mut config);

        let tokens = config
            .get_mut("apikeys")
            .and_then(Value::as_array_mut)
            .ok_or_else(|| "配置文件 apikeys 必须是数组".to_string())?;
        if index >= tokens.len() {
            return Err("未找到要删除的令牌".to_string());
        }
        tokens.remove(index);

        if let Some(names) = config
            .get_mut("desktop_access_token_names")
            .and_then(Value::as_array_mut)
        {
            if index < names.len() {
                names.remove(index);
            }
        }

        write_desktop_config_map(&runtime_dir, &config)?;
        build_desktop_snapshot(&app, runtime_dir)
    })
    .await
}

#[tauri::command]
pub(crate) async fn start_service(app: AppHandle) -> Result<ServiceStatus, String> {
    run_native_task(move || {
        run_service_command(&app, "start")?;
        get_status(app)
    })
    .await
}

#[tauri::command]
pub(crate) async fn stop_service(app: AppHandle) -> Result<ServiceStatus, String> {
    run_native_task(move || {
        run_service_command(&app, "stop")?;
        get_status(app)
    })
    .await
}
