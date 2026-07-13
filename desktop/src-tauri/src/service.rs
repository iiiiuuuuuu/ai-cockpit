use crate::desktop_data::*;
use crate::runtime::*;
use crate::*;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum PortOwnership {
    Available,
    Managed(u32),
    Foreign(Vec<u32>),
}

pub(crate) fn configured_port(runtime_dir: &Path) -> Result<u16, String> {
    let config = read_config(runtime_dir)?;
    Ok(parse_port(config.port).unwrap_or(DEFAULT_PORT))
}

pub(crate) fn parse_lsof_pid_output(output: &str) -> Vec<u32> {
    output
        .lines()
        .filter_map(|line| line.trim().parse::<u32>().ok())
        .collect()
}

pub(crate) fn listening_pids_for_port(port: u16) -> Result<Vec<u32>, String> {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("netstat");
        let output = hide_command_window(&mut command)
            .args(["-ano", "-p", "TCP"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|error| format!("无法检查端口 {port} 占用: {error}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("检查端口 {port} 占用失败: {stderr}"));
        }

        return Ok(parse_windows_netstat_pid_output(
            &String::from_utf8_lossy(&output.stdout),
            port,
        ));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("lsof")
            .arg(format!("-tiTCP:{port}"))
            .arg("-sTCP:LISTEN")
            .arg("-n")
            .arg("-P")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|error| format!("无法检查端口 {port} 占用: {error}"))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            return Ok(parse_lsof_pid_output(&stdout));
        }

        if output.stdout.is_empty() {
            return Ok(Vec::new());
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("检查端口 {port} 占用失败: {stderr}"))
    }
}

#[cfg(any(target_os = "windows", test))]
pub(crate) fn address_uses_port(address: &str, port: u16) -> bool {
    let suffix = format!(":{port}");
    address.trim().ends_with(&suffix)
}

#[cfg(any(target_os = "windows", test))]
pub(crate) fn parse_windows_netstat_pid_output(output: &str, port: u16) -> Vec<u32> {
    let mut pids = Vec::new();

    for line in output.lines() {
        let columns = line.split_whitespace().collect::<Vec<_>>();
        if columns.len() < 5 || !columns[0].eq_ignore_ascii_case("TCP") {
            continue;
        }

        if !columns[3].eq_ignore_ascii_case("LISTENING") || !address_uses_port(columns[1], port) {
            continue;
        }

        if let Ok(pid) = columns[4].parse::<u32>() {
            if !pids.contains(&pid) {
                pids.push(pid);
            }
        }
    }

    pids
}

pub(crate) fn wait_for_pid_exit(pid: u32, timeout: Duration) -> bool {
    let started_at = Instant::now();

    while process_exists(pid) {
        if started_at.elapsed() >= timeout {
            return false;
        }

        thread::sleep(Duration::from_millis(PORT_KILL_POLL_INTERVAL_MS));
    }

    true
}

pub(crate) fn signal_pid(pid: u32, signal: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("taskkill");
        hide_command_window(&mut command);
        command.args(["/PID", &pid.to_string(), "/T"]);
        if signal == "KILL" {
            command.arg("/F");
        }

        let status = command
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .status()
            .map_err(|error| format!("无法终止 PID {pid}: {error}"))?;

        return if status.success() {
            Ok(())
        } else {
            Err(format!("无法终止 PID {pid}"))
        };
    }

    #[cfg(not(target_os = "windows"))]
    {
        let status = Command::new("kill")
            .arg(format!("-{signal}"))
            .arg(pid.to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .status()
            .map_err(|error| format!("无法发送 {signal} 到 PID {pid}: {error}"))?;

        if status.success() {
            Ok(())
        } else {
            Err(format!("无法发送 {signal} 到 PID {pid}"))
        }
    }
}

pub(crate) fn terminate_pid(pid: u32) -> Result<(), String> {
    if !process_exists(pid) {
        return Ok(());
    }

    let _ = signal_pid(pid, "TERM");
    if wait_for_pid_exit(pid, Duration::from_millis(PORT_KILL_WAIT_TIMEOUT_MS)) {
        return Ok(());
    }

    let _ = signal_pid(pid, "KILL");
    if wait_for_pid_exit(pid, Duration::from_millis(PORT_FORCE_KILL_WAIT_TIMEOUT_MS)) {
        return Ok(());
    }

    Err(format!("PID {pid} 占用端口且无法终止"))
}

pub(crate) fn classify_port_ownership(
    listener_pids: &[u32],
    managed_pid: Option<u32>,
) -> PortOwnership {
    if listener_pids.is_empty() {
        return PortOwnership::Available;
    }

    if let Some(pid) = managed_pid {
        if listener_pids
            .iter()
            .all(|listener_pid| *listener_pid == pid)
        {
            return PortOwnership::Managed(pid);
        }
    }

    PortOwnership::Foreign(listener_pids.to_vec())
}

pub(crate) fn port_ownership_for_runtime(
    runtime_dir: &Path,
    port: u16,
) -> Result<PortOwnership, String> {
    let listener_pids = listening_pids_for_port(port)?;
    let managed_pid = read_pid(runtime_dir).filter(|pid| process_exists(*pid));
    Ok(classify_port_ownership(&listener_pids, managed_pid))
}

pub(crate) fn port_conflict_error(port: u16) -> String {
    format!("端口 {port} 已被其他应用占用，请更换端口后重试")
}

pub(crate) fn ensure_port_available_for_change(
    runtime_dir: &Path,
    port: u16,
) -> Result<(), String> {
    match port_ownership_for_runtime(runtime_dir, port)? {
        PortOwnership::Available | PortOwnership::Managed(_) => Ok(()),
        PortOwnership::Foreign(_) => Err(port_conflict_error(port)),
    }
}

pub(crate) fn wait_for_managed_service_port(
    runtime_dir: &Path,
    port: u16,
    timeout: Duration,
) -> Result<(), String> {
    let started_at = Instant::now();

    loop {
        match port_ownership_for_runtime(runtime_dir, port)? {
            PortOwnership::Managed(_) => return Ok(()),
            PortOwnership::Foreign(_) => return Err(port_conflict_error(port)),
            PortOwnership::Available if started_at.elapsed() < timeout => {
                thread::sleep(Duration::from_millis(PORT_KILL_POLL_INTERVAL_MS));
            }
            PortOwnership::Available => {
                return Err(format!("服务端口切换到 {port} 超时，请重试"));
            }
        }
    }
}

pub(crate) fn clear_runtime_process_metadata(runtime_dir: &Path) -> Result<(), String> {
    for file_name in [
        PID_FILE,
        "openai.control.json",
        "openai.control.request.json",
    ] {
        let path = runtime_dir.join(file_name);
        match fs::remove_file(&path) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!("无法清理运行状态文件 {}: {error}", path.display()));
            }
        }
    }

    Ok(())
}

pub(crate) fn force_stop_runtime_service(runtime_dir: &Path) -> Result<(), String> {
    if let Some(pid) = read_pid(runtime_dir) {
        terminate_pid(pid)?;
    }
    clear_runtime_process_metadata(runtime_dir)
}

pub(crate) fn status_for_runtime(runtime_dir: PathBuf) -> ServiceStatus {
    let pid = read_pid(&runtime_dir);
    let mut running = false;
    let mut port_conflict = false;
    let has_config = runtime_dir.join(CONFIG_FILE).exists();
    let mut port = None;
    let mut config_valid = false;
    let mut message = "服务未运行".to_string();

    if has_config {
        match read_config(&runtime_dir) {
            Ok(_) => {
                config_valid = true;
                let selected_port = configured_port(&runtime_dir).unwrap_or(DEFAULT_PORT);
                port = Some(selected_port);
                match port_ownership_for_runtime(&runtime_dir, selected_port) {
                    Ok(PortOwnership::Managed(_)) => {
                        running = true;
                        message = "服务运行中".to_string();
                    }
                    Ok(PortOwnership::Foreign(_)) => {
                        port_conflict = true;
                        message = port_conflict_error(selected_port);
                    }
                    Ok(PortOwnership::Available) => {}
                    Err(error) => {
                        message = error;
                    }
                }
            }
            Err(error) => {
                message = error;
            }
        }
    } else {
        message = "运行目录中缺少 openai.json".to_string();
    }

    ServiceStatus {
        running,
        port_conflict,
        pid,
        port,
        has_config,
        config_valid,
        runtime_dir: runtime_dir.display().to_string(),
        message,
    }
}

pub(crate) fn run_service_command<R: tauri::Runtime>(
    app: &AppHandle<R>,
    action: &str,
) -> Result<(), String> {
    let runtime_dir = ensure_runtime(app)?;
    let node = node_sidecar_path(app)?;

    let port = configured_port(&runtime_dir)?;
    let ownership = port_ownership_for_runtime(&runtime_dir, port)?;
    if action == "start" {
        match ownership {
            PortOwnership::Available => clear_runtime_process_metadata(&runtime_dir)?,
            PortOwnership::Managed(_) => return Ok(()),
            PortOwnership::Foreign(_) => return Err(port_conflict_error(port)),
        }
    } else if action == "restart" {
        match ownership {
            PortOwnership::Available => clear_runtime_process_metadata(&runtime_dir)?,
            PortOwnership::Managed(_) => force_stop_runtime_service(&runtime_dir)?,
            PortOwnership::Foreign(_) => return Err(port_conflict_error(port)),
        }
    } else if action == "stop" {
        match ownership {
            PortOwnership::Managed(_) => {}
            PortOwnership::Available | PortOwnership::Foreign(_) => {
                clear_runtime_process_metadata(&runtime_dir)?;
                return Ok(());
            }
        }
    }

    let mut command = Command::new(node);
    hide_command_window(&mut command);
    command.current_dir(&runtime_dir).arg("run.js");
    if action != "start" {
        command.arg(action);
    }
    command.env("AIROUTER_FORCE_INTERACTIVE", "0");
    command.env("RUN_STARTUP_CHECK_DELAY_MS", "1500");
    command.env("RUN_STARTUP_LOG_WAIT_MS", "800");
    command.env("RUN_STOP_WAIT_TIMEOUT_MS", "2500");
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    let output = command
        .output()
        .map_err(|error| format!("执行服务命令失败: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    Err(format!("服务命令失败: {stdout}{stderr}"))
}

pub(crate) fn emit_startup_status(app: &AppHandle) -> Result<(), String> {
    let runtime_dir = ensure_runtime(app)?;
    if !runtime_dir.join(CONFIG_FILE).exists() {
        app.emit("airouter-config-missing", status_for_runtime(runtime_dir))
            .map_err(|error| format!("无法显示配置引导: {error}"))?;
        return Ok(());
    }

    app.emit("airouter-startup-complete", status_for_runtime(runtime_dir))
        .map_err(|error| format!("无法更新启动状态: {error}"))?;
    Ok(())
}

pub(crate) fn stop_service_quietly<R: tauri::Runtime>(app: &AppHandle<R>) {
    let runtime_dir = app_data_root();
    let graceful_result = run_service_command(app, "stop");
    if let Err(error) = &graceful_result {
        eprintln!("AI Cockpit Desktop stop failed: {error}");
    }

    let Ok(runtime_dir) = runtime_dir else {
        return;
    };
    let port = configured_port(&runtime_dir).unwrap_or(DEFAULT_PORT);
    let service_still_managed = matches!(
        port_ownership_for_runtime(&runtime_dir, port),
        Ok(PortOwnership::Managed(_))
    );
    if service_still_managed {
        if let Err(error) = force_stop_runtime_service(&runtime_dir) {
            eprintln!("AI Cockpit Desktop force stop failed: {error}");
        }
    }
}
