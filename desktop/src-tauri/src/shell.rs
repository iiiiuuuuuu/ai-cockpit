#[cfg(target_os = "windows")]
use crate::runtime::hide_command_window;
use crate::*;

const PROJECT_RELEASE_URL_PREFIX: &str = "https://github.com/iiiiuuuuuu/ai-cockpit/releases/";
const ACCOUNT_HELP_URLS: [&str; 2] = [
    "https://chatgpt.com/",
    "https://chatgpt.com/api/auth/session",
];

pub(crate) fn is_project_release_url(url: &str) -> bool {
    url.starts_with(PROJECT_RELEASE_URL_PREFIX)
}

pub(crate) fn open_project_release_url(url: &str) -> Result<(), String> {
    if !is_project_release_url(url) {
        return Err("版本下载地址无效".to_string());
    }

    open_url_with_system(url, "版本下载页面")
}

pub(crate) fn is_account_help_url(url: &str) -> bool {
    ACCOUNT_HELP_URLS.contains(&url)
}

pub(crate) fn open_account_help_url(url: &str) -> Result<(), String> {
    if !is_account_help_url(url) {
        return Err("账号帮助地址无效".to_string());
    }

    open_url_with_system(url, "账号帮助页面")
}

fn open_url_with_system(url: &str, page_name: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(target_os = "macos")]
    command.arg(url);

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("cmd");
        hide_command_window(&mut command);
        command.args(["/C", "start", "", url]);
        command
    };

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        command
    };

    let status = command
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|error| format!("无法打开{page_name}: {error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("打开{page_name}失败"))
    }
}

pub(crate) fn handle_main_window_close<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    event: &WindowEvent,
) {
    if window.label() != "main" {
        return;
    }

    if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        if let Err(error) = window.hide() {
            eprintln!("AI Cockpit Desktop hide main window failed: {error}");
        }
    }
}

pub(crate) fn show_main_window<R: tauri::Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window.show() {
            eprintln!("AI Cockpit Desktop show main window failed: {error}");
        }
        if let Err(error) = window.set_focus() {
            eprintln!("AI Cockpit Desktop focus main window failed: {error}");
        }
    }
}

pub(crate) fn request_app_exit<R: tauri::Runtime>(app: &AppHandle<R>) {
    if APP_EXIT_REQUESTED.swap(true, Ordering::SeqCst) {
        return;
    }

    let app = app.clone();
    thread::spawn(move || {
        stop_service_quietly(&app);
        app.exit(0);
    });
}

pub(crate) fn setup_tray<R: tauri::Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(
        app,
        TRAY_SHOW_MENU_ID,
        "显示 AI Cockpit",
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, TRAY_QUIT_MENU_ID, "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &separator, &quit_item])?;

    let mut tray = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .tooltip("AI Cockpit")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            if event.id() == TRAY_SHOW_MENU_ID {
                show_main_window(app);
            } else if event.id() == TRAY_QUIT_MENU_ID {
                request_app_exit(app);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) || matches!(
                event,
                TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                }
            ) {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;
    Ok(())
}
