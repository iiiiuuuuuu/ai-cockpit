use crate::commands::run_native_task;
use crate::desktop_data::read_desktop_config_map;
use crate::runtime::ensure_runtime;
use crate::*;
use rfd::FileDialog;
use serde::Serialize;
use std::collections::HashSet;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;

const MAX_ACCOUNT_EXPORT_INDEXES: usize = 10_000;
const MAX_EXPORT_FILENAME_UTF16_UNITS: usize = 120;

const ACCOUNT_EXPORT_FIELDS: [&str; 16] = [
    "type",
    "alias",
    "description",
    "account_id",
    "client_id",
    "access_token",
    "refresh_token",
    "base_url",
    "apikey",
    "support",
    "price_yuan",
    "started_at",
    "stopped_at",
    "sort_order",
    "deleted_at",
    "auto_switch_disabled",
];

#[derive(Debug, Serialize)]
pub(crate) struct DesktopAccountExportResponse {
    saved: bool,
    exported: usize,
}

fn build_account_export_payload(
    config: &Map<String, Value>,
    indexes: &[usize],
    exported_at: &str,
) -> Result<Value, String> {
    let accounts = config
        .get("configs")
        .and_then(Value::as_array)
        .ok_or_else(|| "配置文件 configs 必须是数组".to_string())?;
    let mut seen = HashSet::new();
    let mut selected = Vec::new();

    for &index in indexes {
        let account = accounts
            .get(index)
            .ok_or_else(|| format!("账号索引 {index} 无效，当前共有 {} 个账号", accounts.len()))?;
        if seen.insert(index) {
            selected.push((index, account));
        }
    }

    selected
        .sort_by_key(|(index, account)| (account_sort_order(account).unwrap_or(u64::MAX), *index));

    let exported_accounts = selected
        .into_iter()
        .map(|(index, account)| export_account_fields(account, index))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(serde_json::json!({
        "format": "ai-cockpit-account-export",
        "version": 1,
        "exported_at": exported_at,
        "accounts": exported_accounts,
    }))
}

fn account_sort_order(account: &Value) -> Option<u64> {
    match account.get("sort_order")? {
        Value::Number(number) => number.as_u64(),
        _ => None,
    }
}

fn export_account_fields(account: &Value, index: usize) -> Result<Value, String> {
    let source = account
        .as_object()
        .ok_or_else(|| format!("账号索引 {index} 的配置必须是 JSON 对象"))?;
    let fields = ACCOUNT_EXPORT_FIELDS.iter().filter_map(|field| {
        source
            .get(*field)
            .cloned()
            .map(|value| ((*field).to_string(), value))
    });
    Ok(Value::Object(Map::from_iter(fields)))
}

fn validate_export_indexes(indexes: &[usize]) -> Result<(), String> {
    if indexes.is_empty() {
        return Err("请至少选择一个要导出的账号".to_string());
    }
    if indexes.len() > MAX_ACCOUNT_EXPORT_INDEXES {
        return Err("单次最多可导出 10,000 个账号".to_string());
    }
    Ok(())
}

fn is_windows_reserved_stem(stem: &str) -> bool {
    let stem = stem
        .split('.')
        .next()
        .unwrap_or_default()
        .trim_end_matches([' ', '.'])
        .to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ["COM", "LPT"].iter().any(|prefix| {
            stem.strip_prefix(prefix).is_some_and(|number| {
                matches!(number, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
            })
        })
}

fn validate_selected_export_path(path: &Path) -> Result<(), String> {
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "导出文件名无效".to_string())?;
    let has_json_extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"));
    if !has_json_extension {
        return Err("请选择 JSON 文件".to_string());
    }
    let stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .ok_or_else(|| "导出文件名无效".to_string())?;
    if is_windows_reserved_stem(stem) {
        return Err("导出文件名不能使用系统保留名称".to_string());
    }
    if filename.len() > 240 || filename.encode_utf16().count() > MAX_EXPORT_FILENAME_UTF16_UNITS {
        return Err("导出文件名过长".to_string());
    }
    Ok(())
}

fn sanitize_suggested_export_filename(suggested_filename: &str) -> Result<String, String> {
    let basename = suggested_filename
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default()
        .trim();
    let sanitized = basename
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(character, '<' | '>' | ':' | '"' | '|' | '?' | '*')
            {
                '_'
            } else {
                character
            }
        })
        .collect::<String>();
    let sanitized = sanitized.trim_matches([' ', '.']);
    let filename = if sanitized.is_empty() {
        "ai-cockpit-accounts"
    } else {
        sanitized
    };
    let path = Path::new(filename);
    let has_json_extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"));
    let extension = if has_json_extension {
        path.extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("json")
    } else {
        "json"
    };
    let stem = if has_json_extension {
        path.file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("")
    } else if path.extension().is_some() {
        path.file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("")
    } else {
        filename
    };
    if is_windows_reserved_stem(stem) {
        return Err("导出文件名不能使用系统保留名称".to_string());
    }

    let suffix = format!(".{extension}");
    let mut truncated_stem = String::new();
    for character in stem.chars() {
        let next_utf8 = truncated_stem.len() + character.len_utf8() + suffix.len();
        let next_utf16 = truncated_stem.encode_utf16().count()
            + character.len_utf16()
            + suffix.encode_utf16().count();
        if next_utf8 > 240 || next_utf16 > MAX_EXPORT_FILENAME_UTF16_UNITS {
            break;
        }
        truncated_stem.push(character);
    }
    if truncated_stem.is_empty() {
        return Err("建议文件名无效".to_string());
    }
    let normalized = format!("{truncated_stem}{suffix}");
    validate_selected_export_path(Path::new(&normalized))?;
    Ok(normalized)
}

fn write_account_export_file(path: &Path, contents: &str) -> Result<(), String> {
    const WRITE_ERROR: &str = "无法安全写入账号导出文件";

    #[cfg(unix)]
    {
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

        if path.exists() {
            fs::set_permissions(path, fs::Permissions::from_mode(0o600))
                .map_err(|_| WRITE_ERROR.to_string())?;
        }

        let mut options = OpenOptions::new();
        options.create(true).write(true).truncate(true).mode(0o600);
        let mut file = options.open(path).map_err(|_| WRITE_ERROR.to_string())?;
        file.set_permissions(fs::Permissions::from_mode(0o600))
            .map_err(|_| WRITE_ERROR.to_string())?;
        file.write_all(contents.as_bytes())
            .and_then(|_| file.flush())
            .map_err(|_| WRITE_ERROR.to_string())?;
        file.set_permissions(fs::Permissions::from_mode(0o600))
            .map_err(|_| WRITE_ERROR.to_string())?;
        return Ok(());
    }

    #[cfg(windows)]
    {
        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(path)
            .map_err(|_| WRITE_ERROR.to_string())?;
        file.write_all(contents.as_bytes())
            .and_then(|_| file.flush())
            .map_err(|_| WRITE_ERROR.to_string())
    }
}

#[tauri::command]
pub(crate) async fn export_desktop_accounts(
    app: AppHandle,
    indexes: Vec<usize>,
    exported_at: String,
    suggested_filename: String,
) -> Result<DesktopAccountExportResponse, String> {
    validate_export_indexes(&indexes)?;
    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| "无法获取主窗口".to_string())?;

    run_native_task(move || {
        let runtime_dir = ensure_runtime(&app)?;
        let config = read_desktop_config_map(&runtime_dir)?;
        let payload = build_account_export_payload(&config, &indexes, &exported_at)?;
        let exported = payload["accounts"]
            .as_array()
            .map(Vec::len)
            .unwrap_or_default();
        let filename = sanitize_suggested_export_filename(&suggested_filename)?;
        let Some(path) = FileDialog::new()
            .add_filter("JSON", &["json"])
            .set_file_name(filename)
            .set_parent(&main_window)
            .save_file()
        else {
            return Ok(DesktopAccountExportResponse {
                saved: false,
                exported: 0,
            });
        };
        validate_selected_export_path(&path)?;
        let rendered = serde_json::to_string_pretty(&payload)
            .map_err(|error| format!("无法生成账号导出 JSON: {error}"))?;
        write_account_export_file(&path, &format!("{rendered}\n"))?;

        Ok(DesktopAccountExportResponse {
            saved: true,
            exported,
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::{
        MAX_ACCOUNT_EXPORT_INDEXES, build_account_export_payload,
        sanitize_suggested_export_filename, validate_export_indexes, validate_selected_export_path,
        write_account_export_file,
    };
    use serde_json::{Map, Value, json};
    use std::path::PathBuf;

    fn config_with_accounts(accounts: Vec<Value>) -> Map<String, Value> {
        Map::from_iter([
            ("port".to_string(), Value::from(3009)),
            ("proxy_port".to_string(), Value::from(8080)),
            ("apikeys".to_string(), json!(["entry-token"])),
            ("auth_token".to_string(), Value::from("admin-secret")),
            ("configs".to_string(), Value::Array(accounts)),
            ("active_config_index".to_string(), Value::from(0)),
            ("config_runtimes".to_string(), json!([{"quota": 12}])),
        ])
    }

    #[test]
    fn exports_only_selected_accounts_and_allowed_fields() {
        let config = config_with_accounts(vec![
            json!({"alias": "not-selected", "access_token": "skip"}),
            json!({
                "type": "codex",
                "alias": "selected",
                "description": "selected@example.com",
                "account_id": "account-1",
                "client_id": "client-1",
                "access_token": "access-secret",
                "refresh_token": "refresh-secret",
                "base_url": "https://example.com",
                "apikey": "account-key",
                "support": true,
                "price_yuan": 99,
                "started_at": "2026-07-01T10:00:00Z",
                "stopped_at": null,
                "sort_order": 20,
                "deleted_at": "2026-07-14T10:00:00Z",
                "auto_switch_disabled": true,
                "port": 1234,
                "proxy_port": 5678,
                "apikeys": ["nested-entry-token"],
                "auth_token": "nested-admin-token",
                "config_runtimes": [{"quota": 88}],
                "active_config_index": 3,
                "quota": 100,
                "runtime": {"status": "active"},
                "unknown": "drop-me"
            }),
        ]);

        let payload = build_account_export_payload(&config, &[1], "2026-07-14T12:00:00Z")
            .expect("build payload");

        assert_eq!(payload["format"], "ai-cockpit-account-export");
        assert_eq!(payload["version"], 1);
        assert_eq!(payload["exported_at"], "2026-07-14T12:00:00Z");
        assert_eq!(payload["accounts"].as_array().map(Vec::len), Some(1));
        let account = payload["accounts"][0].as_object().expect("account object");
        assert_eq!(account.get("alias"), Some(&Value::from("selected")));
        assert_eq!(
            account.get("deleted_at"),
            Some(&Value::from("2026-07-14T10:00:00Z"))
        );
        for forbidden in [
            "port",
            "proxy_port",
            "apikeys",
            "auth_token",
            "config_runtimes",
            "active_config_index",
            "quota",
            "runtime",
            "unknown",
        ] {
            assert!(!account.contains_key(forbidden), "exported {forbidden}");
        }
        assert_eq!(config["configs"][1]["unknown"], "drop-me");
    }

    #[test]
    fn deduplicates_indexes_and_sorts_by_valid_sort_order() {
        let config = config_with_accounts(vec![
            json!({"alias": "default-first"}),
            json!({"alias": "ordered-last", "sort_order": 30}),
            json!({"alias": "ordered-first", "sort_order": 10}),
        ]);

        let payload =
            build_account_export_payload(&config, &[1, 2, 1], "now").expect("build payload");
        let aliases = payload["accounts"]
            .as_array()
            .expect("accounts")
            .iter()
            .map(|account| account["alias"].as_str().expect("alias"))
            .collect::<Vec<_>>();

        assert_eq!(aliases, vec!["ordered-first", "ordered-last"]);
    }

    #[test]
    fn sorts_missing_and_string_sort_orders_after_valid_numbers_by_source_index() {
        let config = config_with_accounts(vec![
            json!({"alias": "missing"}),
            json!({"alias": "numeric-string", "sort_order": "1"}),
            json!({"alias": "valid-later", "sort_order": 20}),
            json!({"alias": "valid-first", "sort_order": 10}),
        ]);

        let payload =
            build_account_export_payload(&config, &[1, 3, 0, 2], "now").expect("build payload");
        let aliases = payload["accounts"]
            .as_array()
            .expect("accounts")
            .iter()
            .map(|account| account["alias"].as_str().expect("alias"))
            .collect::<Vec<_>>();

        assert_eq!(
            aliases,
            vec!["valid-first", "valid-later", "missing", "numeric-string"]
        );
    }

    #[test]
    fn rejects_an_invalid_account_index() {
        let config = config_with_accounts(vec![json!({"alias": "only"})]);

        let error = build_account_export_payload(&config, &[0, 4], "now")
            .expect_err("invalid index must fail");

        assert!(error.contains("4"));
        assert!(error.contains("索引"));
    }

    #[test]
    fn suggested_filename_cannot_escape_to_another_directory() {
        assert_eq!(
            sanitize_suggested_export_filename(r#"..\..\secrets\export"#)
                .expect("windows basename"),
            "export.json"
        );
        assert_eq!(
            sanitize_suggested_export_filename("../../export").expect("unix basename"),
            "export.json"
        );
        assert_eq!(
            sanitize_suggested_export_filename("accounts.JSON").expect("safe filename"),
            "accounts.JSON"
        );
    }

    #[test]
    fn selected_export_path_is_validated_without_rewriting() {
        let selected = PathBuf::from("accounts.txt");
        let original = selected.clone();

        let error = validate_selected_export_path(&selected).expect_err("reject non-json path");

        assert_eq!(error, "请选择 JSON 文件");
        assert_eq!(selected, original);
        assert!(validate_selected_export_path(PathBuf::from("accounts").as_path()).is_err());
        assert!(validate_selected_export_path(PathBuf::from("accounts.JSON").as_path()).is_ok());
    }

    #[test]
    fn rejects_dotted_windows_device_stems_on_every_platform() {
        assert!(validate_selected_export_path(PathBuf::from("CON.backup.json").as_path()).is_err());
        assert!(validate_selected_export_path(PathBuf::from("LPT1.old.json").as_path()).is_err());
        assert!(validate_selected_export_path(PathBuf::from("com9.JSON").as_path()).is_err());
    }

    #[test]
    fn truncates_suggested_filename_to_utf8_and_utf16_limits() {
        let oversized = format!("{}.json", "账".repeat(130));
        assert!(validate_selected_export_path(PathBuf::from(&oversized).as_path()).is_err());

        let normalized = sanitize_suggested_export_filename(&oversized).expect("truncate filename");
        assert!(normalized.len() <= 240);
        assert!(normalized.encode_utf16().count() <= 120);
        assert!(normalized.starts_with('账'));
        assert!(normalized.ends_with(".json"));
    }

    #[test]
    fn rejects_more_than_the_export_index_limit() {
        assert!(validate_export_indexes(&vec![0; MAX_ACCOUNT_EXPORT_INDEXES]).is_ok());
        let error = validate_export_indexes(&vec![0; MAX_ACCOUNT_EXPORT_INDEXES + 1])
            .expect_err("too many indexes");
        assert!(error.contains("10,000"));
    }

    #[cfg(unix)]
    #[test]
    fn export_file_permissions_are_restricted_when_overwriting() {
        use std::os::unix::fs::PermissionsExt;

        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("accounts.json");
        std::fs::write(&path, "old").expect("seed file");
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o666))
            .expect("widen permissions");

        write_account_export_file(&path, "secret\n").expect("write export");

        assert_eq!(
            std::fs::read_to_string(&path).expect("read export"),
            "secret\n"
        );
        assert_eq!(
            std::fs::metadata(&path)
                .expect("metadata")
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
}
