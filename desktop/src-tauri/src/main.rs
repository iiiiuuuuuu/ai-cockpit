#![cfg_attr(
    all(target_os = "windows", not(debug_assertions)),
    windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{CloseHandle, STILL_ACTIVE};
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::Threading::{
    GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
};

mod account_export;
mod commands;
mod desktop_data;
mod runtime;
mod service;
mod shell;

use account_export::*;
use commands::*;
use service::*;
use shell::*;
const APP_DIR_NAME: &str = "AI Cockpit";
const CONFIG_FILE: &str = "openai.json";
const CONFIG_TEMPLATE_FILE: &str = "openai.json.example";
const PID_FILE: &str = "openai.pid";
const DEFAULT_PORT: u16 = 3009;
const PORT_KILL_WAIT_TIMEOUT_MS: u64 = 2_500;
const PORT_FORCE_KILL_WAIT_TIMEOUT_MS: u64 = 800;
const PORT_KILL_POLL_INTERVAL_MS: u64 = 100;
const TRAY_SHOW_MENU_ID: &str = "show-main-window";
const TRAY_QUIT_MENU_ID: &str = "quit-app";

static APP_EXIT_REQUESTED: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceStatus {
    running: bool,
    port_conflict: bool,
    pid: Option<u32>,
    port: Option<u16>,
    has_config: bool,
    config_valid: bool,
    runtime_dir: String,
    message: String,
}

#[derive(Debug, Deserialize)]
struct ConfigShape {
    port: Option<Value>,
    auth_token: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSettings {
    port: u16,
    proxy_port: Option<u16>,
    routing_preference: String,
    auto_switch: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopAccount {
    index: usize,
    item: Value,
    runtime: Value,
    #[serde(rename = "is_active")]
    is_active: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopAccessToken {
    index: usize,
    name: String,
    token: String,
    masked: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSnapshot {
    service: ServiceStatus,
    settings: DesktopSettings,
    accounts: Vec<DesktopAccount>,
    access_tokens: Vec<DesktopAccessToken>,
}

#[derive(Clone, Debug, Default)]
struct DesktopBatchImportSummary {
    imported: usize,
    updated: usize,
    skipped: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopBatchImportResponse {
    snapshot: DesktopSnapshot,
    imported: usize,
    updated: usize,
    skipped: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveDesktopSettingsRequest {
    port: Option<Value>,
    proxy_port: Option<Value>,
    routing_preference: Option<String>,
    auto_switch: Option<bool>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            setup_tray(app.handle())?;

            let app_handle = app.handle().clone();
            thread::spawn(move || {
                if let Err(error) = emit_startup_status(&app_handle) {
                    eprintln!("AI Cockpit Desktop startup failed: {error}");
                    let _ = app_handle.emit("airouter-startup-error", error);
                }
            });
            Ok(())
        })
        .on_window_event(handle_main_window_close)
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            open_release_page,
            open_account_help_page,
            get_desktop_snapshot,
            save_desktop_settings,
            save_desktop_account,
            export_desktop_accounts,
            import_desktop_accounts,
            save_desktop_account_order,
            activate_desktop_account,
            refresh_desktop_account,
            toggle_desktop_account_auto_switch,
            restore_desktop_account,
            mark_desktop_account_deleted,
            delete_desktop_account,
            save_access_token,
            delete_access_token,
            start_service,
            stop_service,
        ])
        .build(tauri::generate_context!())
        .expect("error while building AI Cockpit Desktop");

    app.run(|app_handle, event| match event {
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => show_main_window(app_handle),
        RunEvent::ExitRequested { api, .. } => {
            if !APP_EXIT_REQUESTED.load(Ordering::SeqCst) {
                api.prevent_exit();
                request_app_exit(app_handle);
            }
        }
        RunEvent::Exit => {
            if !APP_EXIT_REQUESTED.load(Ordering::SeqCst) {
                stop_service_quietly(app_handle);
            }
        }
        _ => {}
    });
}

fn main() {
    run();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::desktop_data::*;
    use crate::runtime::sync_runtime_resources;

    fn native_source() -> String {
        let source_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src");
        [
            "main.rs",
            "account_export.rs",
            "commands.rs",
            "desktop_data.rs",
            "runtime.rs",
            "service.rs",
            "shell.rs",
        ]
        .into_iter()
        .map(|file| fs::read_to_string(source_dir.join(file)).expect("read native source"))
        .collect::<Vec<_>>()
        .join("\n")
    }

    #[test]
    fn builds_admin_api_url_with_explicit_port_for_runtime_port_changes() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::write(
            temp.path().join(CONFIG_FILE),
            r#"{"port":3010,"auth_token":"auth_456"}"#,
        )
        .expect("write config");

        assert_eq!(
            admin_api_url_with_port(temp.path(), "/admin/api/settings", 3009)
                .expect("admin api url"),
            "http://localhost:3009/admin/api/settings?auth_token=auth_456"
        );
    }

    #[test]
    fn parses_numeric_and_string_ports() {
        assert_eq!(parse_port(Some(Value::from(3010))), Some(3010));
        assert_eq!(parse_port(Some(Value::from("3011"))), Some(3011));
        assert_eq!(parse_port(Some(Value::from("bad"))), None);
    }

    #[test]
    fn reads_configured_port_from_runtime_config() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::write(temp.path().join(CONFIG_FILE), r#"{"port":"31888"}"#).expect("write config");
        assert_eq!(
            configured_port(temp.path()).expect("configured port"),
            31888
        );
    }

    #[test]
    fn configured_port_falls_back_to_default_when_missing() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::write(temp.path().join(CONFIG_FILE), r#"{}"#).expect("write config");
        assert_eq!(
            configured_port(temp.path()).expect("configured port"),
            DEFAULT_PORT
        );
    }

    #[test]
    fn builds_account_reload_body_from_auto_switch_flag() {
        let enabled = serde_json::json!({
            "alias": "primary",
            "auto_switch_disabled": true
        });
        let default_enabled = serde_json::json!({
            "alias": "secondary"
        });

        assert_eq!(
            desktop_account_reload_body(&enabled),
            serde_json::json!({ "auto_switch_disabled": true })
        );
        assert_eq!(
            desktop_account_reload_body(&default_enabled),
            serde_json::json!({ "auto_switch_disabled": false })
        );
    }

    #[test]
    fn batch_import_skips_existing_accounts_and_appends_new_accounts_once() {
        let mut configs = vec![serde_json::json!({
            "description": "existing@example.com",
            "account_id": "acc-existing",
            "access_token": "old-access",
            "sort_order": 10
        })];
        let requests = vec![
            serde_json::json!({
                "mode": "token",
                "description": "existing@example.com",
                "account_id": "acc-existing",
                "access_token": "old-access"
            }),
            serde_json::json!({
                "mode": "token",
                "description": "new@example.com",
                "account_id": "acc-new",
                "access_token": "new-access"
            }),
        ];

        let summary =
            apply_desktop_batch_import(&mut configs, &requests, false).expect("batch import");

        assert_eq!(summary.imported, 1);
        assert_eq!(summary.updated, 0);
        assert_eq!(summary.skipped, 1);
        assert_eq!(configs.len(), 2);
        assert_eq!(configs[1].get("account_id"), Some(&Value::from("acc-new")));
        assert_eq!(configs[1].get("sort_order"), Some(&Value::from(20)));
    }

    #[test]
    fn batch_import_preserves_lifecycle_fields_for_new_accounts_in_request_order() {
        let mut configs = vec![serde_json::json!({
            "account_id": "acc-existing",
            "access_token": "existing-access",
            "sort_order": 10
        })];
        let requests = vec![
            serde_json::json!({
                "mode": "token",
                "account_id": "acc-deleted",
                "access_token": "deleted-access",
                "deleted_at": "2026-07-01T10:00:00Z",
                "auto_switch_disabled": true
            }),
            serde_json::json!({
                "mode": "apikey",
                "alias": "Second API",
                "base_url": "https://api.example.com/v1",
                "apikey": "sk-second",
                "deleted_at": "2026-07-02T10:00:00Z"
            }),
        ];

        let summary = apply_desktop_batch_import(&mut configs, &requests, false)
            .expect("batch lifecycle import");

        assert_eq!(summary.imported, 2);
        assert_eq!(configs.len(), 3);
        assert_eq!(
            configs[1].get("account_id"),
            Some(&Value::from("acc-deleted"))
        );
        assert_eq!(
            configs[1].get("deleted_at"),
            Some(&Value::from("2026-07-01T10:00:00Z"))
        );
        assert_eq!(
            configs[1].get("auto_switch_disabled"),
            Some(&Value::Bool(true))
        );
        assert_eq!(configs[1].get("sort_order"), Some(&Value::from(20)));
        assert_eq!(configs[2].get("alias"), Some(&Value::from("Second API")));
        assert_eq!(
            configs[2].get("deleted_at"),
            Some(&Value::from("2026-07-02T10:00:00Z"))
        );
        assert_eq!(configs[2].get("sort_order"), Some(&Value::from(30)));
    }

    #[test]
    fn batch_import_updates_credentials_without_overwriting_local_account_metadata() {
        let mut configs = vec![serde_json::json!({
            "description": "old@example.com",
            "alias": "Primary",
            "account_id": "acc-existing",
            "client_id": "old-client",
            "access_token": "old-access",
            "refresh_token": "old-refresh",
            "price_yuan": 140,
            "started_at": "2026-07-01T10:00",
            "sort_order": 30
        })];
        let requests = vec![serde_json::json!({
            "mode": "token",
            "description": "new@example.com",
            "alias": "Imported alias",
            "account_id": "acc-existing",
            "client_id": "new-client",
            "access_token": "new-access",
            "refresh_token": "new-refresh",
            "price_yuan": 999,
            "started_at": "2026-07-14T10:00",
            "deleted_at": "2026-07-14T09:00:00Z",
            "auto_switch_disabled": true
        })];

        let summary = apply_desktop_batch_import(&mut configs, &requests, true)
            .expect("batch credential update");
        let updated = configs[0].as_object().expect("updated account");

        assert_eq!(summary.imported, 0);
        assert_eq!(summary.updated, 1);
        assert_eq!(summary.skipped, 0);
        assert_eq!(
            updated.get("access_token"),
            Some(&Value::from("new-access"))
        );
        assert_eq!(
            updated.get("refresh_token"),
            Some(&Value::from("new-refresh"))
        );
        assert_eq!(updated.get("client_id"), Some(&Value::from("new-client")));
        assert_eq!(
            updated.get("description"),
            Some(&Value::from("new@example.com"))
        );
        assert_eq!(updated.get("alias"), Some(&Value::from("Primary")));
        assert_eq!(updated.get("price_yuan"), Some(&Value::from(140)));
        assert_eq!(
            updated.get("started_at"),
            Some(&Value::from("2026-07-01T10:00"))
        );
        assert_eq!(updated.get("sort_order"), Some(&Value::from(30)));
        assert_eq!(updated.get("deleted_at"), None);
        assert_eq!(updated.get("auto_switch_disabled"), None);
    }

    #[test]
    fn batch_import_never_restores_deleted_accounts_implicitly() {
        let mut configs = vec![serde_json::json!({
            "description": "deleted@example.com",
            "account_id": "acc-deleted",
            "access_token": "old-access",
            "deleted_at": "2026-07-01T10:00:00",
            "sort_order": 10
        })];
        let requests = vec![serde_json::json!({
            "mode": "token",
            "description": "deleted@example.com",
            "account_id": "acc-deleted",
            "access_token": "new-access"
        })];

        let summary = apply_desktop_batch_import(&mut configs, &requests, true)
            .expect("skip deleted account");

        assert_eq!(summary.imported, 0);
        assert_eq!(summary.updated, 0);
        assert_eq!(summary.skipped, 1);
        assert_eq!(
            configs[0].get("access_token"),
            Some(&Value::from("old-access"))
        );
        assert!(configs[0].get("deleted_at").is_some());
    }

    #[test]
    fn batch_import_updates_a_subject_matched_token_by_preview_index() {
        let mut configs = vec![serde_json::json!({
            "description": "subject@example.com",
            "access_token": "old-access",
            "sort_order": 10
        })];
        let requests = vec![serde_json::json!({
            "mode": "token",
            "existing_index": 0,
            "description": "subject@example.com",
            "access_token": "new-access"
        })];

        let summary = apply_desktop_batch_import(&mut configs, &requests, true)
            .expect("update subject matched token");

        assert_eq!(summary.updated, 1);
        assert_eq!(configs.len(), 1);
        assert_eq!(
            configs[0].get("access_token"),
            Some(&Value::from("new-access"))
        );
    }

    #[test]
    fn batch_import_rejects_a_stale_preview_index_for_another_account_id() {
        let mut configs = vec![serde_json::json!({
            "account_id": "workspace-one",
            "access_token": "first-access",
            "sort_order": 10
        })];
        let requests = vec![serde_json::json!({
            "mode": "token",
            "existing_index": 0,
            "account_id": "workspace-two",
            "access_token": "second-access"
        })];

        let summary = apply_desktop_batch_import(&mut configs, &requests, true)
            .expect("do not overwrite another workspace");

        assert_eq!(summary.imported, 1);
        assert_eq!(summary.updated, 0);
        assert_eq!(configs.len(), 2);
        assert_eq!(
            configs[0].get("access_token"),
            Some(&Value::from("first-access"))
        );
        assert_eq!(
            configs[1].get("account_id"),
            Some(&Value::from("workspace-two"))
        );
    }

    #[test]
    fn builds_desktop_settings_admin_body_for_runtime_reload() {
        let mut config = Map::new();
        config.insert("port".to_string(), Value::from(3020));
        config.insert("proxy_port".to_string(), Value::from(8899));
        config.insert(
            "routing_preference".to_string(),
            Value::String("apikey_first".to_string()),
        );
        config.insert("auto_switch".to_string(), Value::Bool(false));

        assert_eq!(
            desktop_settings_admin_body(&config),
            serde_json::json!({
                "port": 3020,
                "proxy_port": 8899,
                "routing_preference": "apikey_first",
            })
        );

        config.remove("proxy_port");
        assert_eq!(
            desktop_settings_admin_body(&config).get("proxy_port"),
            Some(&Value::Null)
        );
    }

    #[test]
    fn applies_custom_order_only_to_non_deleted_accounts() {
        let mut configs = vec![
            serde_json::json!({ "alias": "first", "sort_order": 10 }),
            serde_json::json!({ "alias": "deleted", "sort_order": 20, "deleted_at": "2026-07-14T10:00:00" }),
            serde_json::json!({ "alias": "third", "sort_order": 30 }),
        ];

        apply_desktop_account_order(&mut configs, &[2, 0]).expect("apply account order");

        assert_eq!(configs[2].get("sort_order"), Some(&Value::from(10)));
        assert_eq!(configs[0].get("sort_order"), Some(&Value::from(20)));
        assert_eq!(configs[1].get("sort_order"), Some(&Value::from(20)));
    }

    #[test]
    fn rejects_custom_order_that_omits_an_active_account() {
        let mut configs = vec![
            serde_json::json!({ "alias": "first" }),
            serde_json::json!({ "alias": "second" }),
        ];

        let error = apply_desktop_account_order(&mut configs, &[1]).expect_err("missing index");

        assert!(error.contains("全部未删除账号"));
    }

    #[test]
    fn restores_deleted_account_at_the_end_of_custom_order() {
        let mut configs = vec![
            serde_json::json!({ "alias": "first", "sort_order": 10 }),
            serde_json::json!({ "alias": "deleted", "sort_order": 5, "deleted_at": "2026-07-14T10:00:00" }),
            serde_json::json!({ "alias": "third", "sort_order": 20 }),
        ];

        let sort_order = restore_desktop_account_at_end(&mut configs, 1).expect("restore account");

        assert_eq!(sort_order, 30);
        assert_eq!(configs[1].get("sort_order"), Some(&Value::from(30)));
        assert_eq!(configs[1].get("deleted_at"), None);
    }

    #[test]
    fn save_desktop_settings_reloads_running_service_through_admin_settings() {
        let source = fs::read_to_string(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("src")
                .join("commands.rs"),
        )
        .expect("read commands source");
        let running_index = source
            .find("let service_was_running = status_for_runtime")
            .expect("capture running state");
        let write_index = source
            .find("write_desktop_config_map(&runtime_dir, &config)")
            .expect("config write");

        assert!(running_index < write_index);
        assert!(source.contains("call_admin_api_on_port"));
        assert!(source.contains("\"/admin/api/settings\""));
        assert!(source.contains("wait_for_managed_service_port"));
    }

    #[test]
    fn parses_lsof_pid_output() {
        assert_eq!(
            parse_lsof_pid_output("123\n 456 \nnot-a-pid\n789\n"),
            vec![123, 456, 789]
        );
    }

    #[test]
    fn parses_windows_netstat_pid_output() {
        let output = r#"
  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:3009           0.0.0.0:0              LISTENING       1234
  TCP    [::]:3009              [::]:0                 LISTENING       1234
  TCP    127.0.0.1:3010         0.0.0.0:0              LISTENING       9999
"#;

        assert_eq!(parse_windows_netstat_pid_output(output, 3009), vec![1234]);
    }

    #[test]
    fn classifies_listener_ownership_without_treating_foreign_processes_as_managed() {
        assert_eq!(
            classify_port_ownership(&[], Some(1200)),
            PortOwnership::Available
        );
        assert_eq!(
            classify_port_ownership(&[1200], Some(1200)),
            PortOwnership::Managed(1200)
        );
        assert_eq!(
            classify_port_ownership(&[2200], Some(1200)),
            PortOwnership::Foreign(vec![2200])
        );
        assert_eq!(
            classify_port_ownership(&[1200, 2200], Some(1200)),
            PortOwnership::Foreign(vec![1200, 2200])
        );
        assert_eq!(
            classify_port_ownership(&[2200], None),
            PortOwnership::Foreign(vec![2200])
        );
    }

    #[test]
    fn start_path_never_kills_every_listener_on_the_configured_port() {
        let source = fs::read_to_string(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("src")
                .join("service.rs"),
        )
        .expect("read service source");
        let old_function = ["fn kill_port", "_listeners"].join("");
        let old_call = ["kill_port", "_listeners(port)"].join("");

        assert!(!source.contains(&old_function));
        assert!(!source.contains(&old_call));
        assert!(source.contains("port_ownership_for_runtime"));
        assert!(source.contains("端口 {port} 已被其他应用占用"));
    }

    #[test]
    fn settings_port_changes_are_checked_before_config_is_written() {
        let source = fs::read_to_string(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("src")
                .join("commands.rs"),
        )
        .expect("read commands source");
        let check_index = source
            .find("ensure_port_available_for_change(&runtime_dir, next_port)")
            .expect("port availability check");
        let write_index = source
            .find("write_desktop_config_map(&runtime_dir, &config)")
            .expect("config write");

        assert!(check_index < write_index);
    }

    #[test]
    fn release_windows_build_uses_gui_subsystem() {
        let source = native_source();

        assert!(source.contains("windows_subsystem = \"windows\""));
    }

    #[test]
    fn close_handler_quiet_stop_supports_generic_tauri_runtime() {
        let source = native_source();

        let generic_signature = "fn stop_service_quietly<R: tauri::Runtime>(app: &AppHandle<R>)";
        assert_eq!(source.matches(generic_signature).count(), 2);
    }

    #[test]
    fn windows_background_commands_do_not_open_console_windows() {
        let source = native_source();

        assert!(source.contains("use std::os::windows::process::CommandExt;"));
        assert!(source.contains("CREATE_NO_WINDOW"));
        assert!(
            source.matches("hide_command_window(").count() >= 6,
            "all recurring background commands should opt out of Windows console windows"
        );
    }

    #[test]
    fn runtime_helpers_are_available_to_split_modules() {
        let shell_source = fs::read_to_string(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("src")
                .join("shell.rs"),
        )
        .expect("read shell source");

        assert!(shell_source.contains("use crate::runtime::hide_command_window;"));
    }

    #[test]
    fn windows_process_status_does_not_spawn_powershell() {
        let source = native_source();

        assert!(
            !source.contains("Command::new(\"powershell\")"),
            "frequent status polling must not spawn powershell on Windows"
        );
        assert!(source.contains("OpenProcess"));
        assert!(source.contains("GetExitCodeProcess"));
        assert!(source.contains("STILL_ACTIVE as u32"));
    }

    #[test]
    fn macos_bundle_enables_node_jit_entitlement() {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let tauri_config =
            fs::read_to_string(manifest_dir.join("tauri.conf.json")).expect("read tauri config");
        let entitlements =
            fs::read_to_string(manifest_dir.join("entitlements.plist")).expect("read entitlements");

        assert!(tauri_config.contains(r#""entitlements": "entitlements.plist""#));
        assert!(entitlements.contains("<key>com.apple.security.cs.allow-jit</key>"));
        assert!(entitlements.contains("<true/>"));
    }

    #[test]
    fn main_window_title_is_visible_to_windows_shell() {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let tauri_config =
            fs::read_to_string(manifest_dir.join("tauri.conf.json")).expect("read tauri config");

        assert!(tauri_config.contains(r#""productName": "AI Cockpit""#));
        assert!(
            tauri_config.contains(r#""title": "AI Cockpit""#),
            "Windows taskbar and Task Manager need a non-empty main window title"
        );
    }

    #[test]
    fn packaged_node_sidecar_prefers_app_bundle_over_manifest_binary() {
        let source = native_source();

        let app_bundle_node = "exe_dir.join(\"node\")";
        let manifest_node = "manifest_dir.join(\"binaries\").join(\"node\")";
        let app_bundle_index = source
            .find(app_bundle_node)
            .expect("current executable node candidate");
        let manifest_index = source.find(manifest_node).expect("manifest node candidate");

        assert!(
            app_bundle_index < manifest_index,
            "packaged app must choose Contents/MacOS/node before workspace binaries"
        );
    }

    #[test]
    fn startup_events_include_console_ready_event_name() {
        let source = native_source();

        let old_startup_function = ["maybe_start_or_prompt", "_for_config"].join("");
        let old_navigation_call = ["start_and_show_config_page", "(app).map(|_| ())"].join("");

        assert!(source.contains("airouter-startup-complete"));
        assert!(source.contains("emit_startup_status"));
        assert!(!source.contains(&old_startup_function));
        assert!(!source.contains(&old_navigation_call));
    }

    #[test]
    fn close_button_hides_main_window_without_stopping_service() {
        let source = native_source();

        assert!(source.contains("handle_main_window_close"));
        assert!(source.contains("api.prevent_close();"));
        assert!(source.contains("window.hide()"));
        assert!(
            !source.contains(
                "CloseRequested { api, .. } = event {\n        #[cfg(target_os = \"macos\")]"
            ),
            "close-to-hide should apply to Windows as well as macOS"
        );
        assert!(
            !source.contains("CloseRequested { .. }) {\n                let app = window.app_handle().clone();\n                stop_service_quietly(&app);"),
            "close event must not synchronously stop the service"
        );
    }

    #[test]
    fn tray_menu_provides_explicit_async_exit_path() {
        let source = native_source();

        assert!(source.contains("TrayIconBuilder::with_id(\"main-tray\")"));
        assert!(source.contains("show_menu_on_left_click(false)"));
        assert!(source.contains("TRAY_SHOW_MENU_ID"));
        assert!(source.contains("TRAY_QUIT_MENU_ID"));
        assert!(source.contains("fn request_app_exit"));
        assert!(
            source.contains("thread::spawn(move ||") && source.contains("app.exit(0);"),
            "explicit tray exit should stop the service off the UI thread before exiting"
        );
    }

    #[test]
    fn final_exit_event_stops_service_when_exit_request_was_not_intercepted() {
        let source = native_source();

        assert!(source.contains("RunEvent::Exit =>"));
        assert!(source.contains(
            "if !APP_EXIT_REQUESTED.load(Ordering::SeqCst) {\n                stop_service_quietly(app_handle);"
        ));
    }

    #[test]
    fn accepts_only_ai_cockpit_github_release_urls() {
        assert!(is_project_release_url(
            "https://github.com/iiiiuuuuuu/ai-cockpit/releases/tag/v0.3.0"
        ));
        assert!(is_project_release_url(
            "https://github.com/iiiiuuuuuu/ai-cockpit/releases/latest"
        ));
        assert!(!is_project_release_url("https://example.com/download"));
        assert!(!is_project_release_url(
            "https://github.com/other/repository/releases/tag/v1.0.0"
        ));
    }

    #[test]
    fn accepts_only_approved_chatgpt_account_help_urls() {
        assert!(is_account_help_url("https://chatgpt.com/"));
        assert!(is_account_help_url("https://chatgpt.com/api/auth/session"));
        assert!(!is_account_help_url("https://chatgpt.com/api/other"));
        assert!(!is_account_help_url("https://example.com/"));
    }

    #[test]
    fn forced_exit_cleanup_removes_stale_runtime_process_metadata() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::write(temp.path().join(PID_FILE), "99999999").expect("write stale pid");
        fs::write(temp.path().join("openai.control.json"), "{}").expect("write control file");
        fs::write(temp.path().join("openai.control.request.json"), "{}")
            .expect("write request file");

        force_stop_runtime_service(temp.path()).expect("force stop stale runtime");

        assert!(!temp.path().join(PID_FILE).exists());
        assert!(!temp.path().join("openai.control.json").exists());
        assert!(!temp.path().join("openai.control.request.json").exists());
    }

    #[test]
    fn runtime_resource_sync_replaces_dependencies_when_lockfile_changes() {
        let temp = tempfile::tempdir().expect("tempdir");
        let source = temp.path().join("source");
        let destination = temp.path().join("destination");
        fs::create_dir_all(source.join("node_modules/tweetnacl")).expect("source modules");
        fs::create_dir_all(destination.join("node_modules/legacy")).expect("destination modules");
        fs::write(source.join("package-lock.json"), "new-lock").expect("source lock");
        fs::write(destination.join("package-lock.json"), "old-lock").expect("destination lock");
        fs::write(source.join("node_modules/tweetnacl/index.js"), "module.exports = {}")
            .expect("source dependency");
        fs::write(destination.join("node_modules/legacy/index.js"), "legacy")
            .expect("legacy dependency");

        sync_runtime_resources(&source, &destination).expect("sync resources");

        assert!(destination.join("node_modules/tweetnacl/index.js").exists());
        assert!(!destination.join("node_modules/legacy/index.js").exists());
    }

    #[test]
    fn macos_reopen_event_is_not_compiled_on_windows() {
        let source = native_source();

        assert!(
            source.contains("#[cfg(target_os = \"macos\")]\n        RunEvent::Reopen"),
            "RunEvent::Reopen is macOS-only and must stay behind a target_os gate"
        );
    }
}
