use crate::*;

pub(crate) fn app_data_root() -> Result<PathBuf, String> {
    dirs::data_dir()
        .map(|dir| dir.join(APP_DIR_NAME))
        .ok_or_else(|| "无法定位系统应用数据目录".to_string())
}

pub(crate) fn hide_command_window(command: &mut Command) -> &mut Command {
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command
}

pub(crate) fn resource_airouter_dir<R: tauri::Runtime>(
    app: &AppHandle<R>,
) -> Result<PathBuf, String> {
    let resolver = app.path();
    let resource_dir = resolver
        .resource_dir()
        .map_err(|error| format!("无法定位应用资源目录: {error}"))?;

    let candidates = [
        resource_dir.join("resources").join("airouter"),
        resource_dir.join("airouter"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("airouter"),
    ];

    candidates
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(|| "找不到 airouter bundled resources".to_string())
}

pub(crate) fn node_target_name() -> Result<&'static str, String> {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Ok("node-aarch64-apple-darwin")
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        Ok("node-x86_64-apple-darwin")
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Ok("node-x86_64-pc-windows-msvc.exe")
    } else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        Ok("node-aarch64-pc-windows-msvc.exe")
    } else {
        Err("当前系统架构暂未内置 Node.js".to_string())
    }
}

pub(crate) fn node_sidecar_path<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let resolver = app.path();
    let resource_dir = resolver
        .resource_dir()
        .map_err(|error| format!("无法定位应用资源目录: {error}"))?;
    let current_exe_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf));
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let target_name = node_target_name()?;

    let mut candidates = vec![
        resource_dir.join("binaries").join("node"),
        resource_dir.join("binaries").join("node.exe"),
        resource_dir.join("binaries").join(target_name),
        resource_dir.join("node"),
        resource_dir.join("node.exe"),
        resource_dir.join(target_name),
    ];

    if let Some(exe_dir) = current_exe_dir {
        candidates.push(exe_dir.join("node"));
        candidates.push(exe_dir.join("node.exe"));
        candidates.push(exe_dir.join(target_name));
        candidates.push(exe_dir.join("binaries").join("node"));
        candidates.push(exe_dir.join("binaries").join("node.exe"));
        candidates.push(exe_dir.join("binaries").join(target_name));
    }

    candidates.push(manifest_dir.join("binaries").join("node"));
    candidates.push(manifest_dir.join("binaries").join("node.exe"));
    candidates.push(manifest_dir.join("binaries").join(target_name));

    candidates
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(|| format!("找不到 bundled Node.js sidecar: {target_name}"))
}

pub(crate) fn copy_dir_if_missing(source: &Path, destination: &Path) -> Result<(), String> {
    if destination.exists() {
        return Ok(());
    }

    let parent = destination
        .parent()
        .ok_or_else(|| format!("无法定位目标父目录: {}", destination.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("无法创建目录 {}: {error}", parent.display()))?;

    copy_dir_recursive(source, destination).map_err(|error| {
        format!(
            "复制运行资源失败 {} -> {}: {error}",
            source.display(),
            destination.display()
        )
    })
}

pub(crate) fn copy_dir_recursive(source: &Path, destination: &Path) -> io::Result<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let target = destination.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

pub(crate) fn copy_entry_replace(source: &Path, destination: &Path) -> Result<(), String> {
    if destination.exists() {
        if destination.is_dir() {
            fs::remove_dir_all(destination)
                .map_err(|error| format!("无法清理目录 {}: {error}", destination.display()))?;
        } else {
            fs::remove_file(destination)
                .map_err(|error| format!("无法清理文件 {}: {error}", destination.display()))?;
        }
    }

    if source.is_dir() {
        copy_dir_recursive(source, destination).map_err(|error| {
            format!(
                "同步目录失败 {} -> {}: {error}",
                source.display(),
                destination.display()
            )
        })?;
    } else if source.is_file() {
        let parent = destination
            .parent()
            .ok_or_else(|| format!("无法定位目标父目录: {}", destination.display()))?;
        fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建目录 {}: {error}", parent.display()))?;
        fs::copy(source, destination).map_err(|error| {
            format!(
                "同步文件失败 {} -> {}: {error}",
                source.display(),
                destination.display()
            )
        })?;
    }

    Ok(())
}

pub(crate) fn sync_runtime_resources(source: &Path, destination: &Path) -> Result<(), String> {
    let source_lockfile = source.join("package-lock.json");
    let destination_lockfile = destination.join("package-lock.json");
    let dependencies_changed = source_lockfile.is_file()
        && (!destination_lockfile.is_file()
            || fs::read(&source_lockfile).map_err(|error| error.to_string())?
                != fs::read(&destination_lockfile).map_err(|error| error.to_string())?);
    if dependencies_changed {
        copy_entry_replace(
            &source.join("node_modules"),
            &destination.join("node_modules"),
        )?;
    }

    for entry in fs::read_dir(source)
        .map_err(|error| format!("无法读取资源目录 {}: {error}", source.display()))?
    {
        let entry = entry.map_err(|error| format!("无法读取资源条目: {error}"))?;
        let file_name = entry.file_name();
        let file_name_text = file_name.to_string_lossy();
        let target = destination.join(&file_name);

        if file_name_text == "node_modules" {
            if !dependencies_changed && !target.exists() {
                copy_dir_recursive(&entry.path(), &target).map_err(|error| {
                    format!(
                        "同步 node_modules 失败 {} -> {}: {error}",
                        entry.path().display(),
                        target.display()
                    )
                })?;
            }
            continue;
        }

        copy_entry_replace(&entry.path(), &target)?;
    }

    Ok(())
}

fn resource_tree_differs(source: &Path, destination: &Path) -> io::Result<bool> {
    if !destination.exists() {
        return Ok(true);
    }

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let name = entry.file_name();
        if name == "node_modules" {
            continue;
        }
        let target = destination.join(&name);
        let source_type = entry.file_type()?;
        if source_type.is_dir() {
            if resource_tree_differs(&entry.path(), &target)? {
                return Ok(true);
            }
        } else if !target.is_file() || fs::read(entry.path())? != fs::read(&target)? {
            return Ok(true);
        }
    }

    Ok(false)
}

pub(crate) fn ensure_runtime<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let runtime_dir = app_data_root()?;
    let resources = resource_airouter_dir(app)?;

    if !runtime_dir.exists() {
        copy_dir_if_missing(&resources, &runtime_dir)?;
    } else {
        let resources_changed = resource_tree_differs(&resources, &runtime_dir)
            .map_err(|error| format!("无法检查运行资源版本: {error}"))?;
        if resources_changed {
            if read_pid(&runtime_dir).is_some_and(|pid| process_exists(pid)) {
                force_stop_runtime_service(&runtime_dir)?;
            }
        }
        sync_runtime_resources(&resources, &runtime_dir)?;
    }

    let config_path = runtime_dir.join(CONFIG_FILE);
    let template_path = runtime_dir.join(CONFIG_TEMPLATE_FILE);
    if !config_path.exists() && !template_path.exists() {
        return Err(format!("运行目录缺少配置模板 {}", template_path.display()));
    }

    Ok(runtime_dir)
}

pub(crate) fn read_pid(runtime_dir: &Path) -> Option<u32> {
    let raw = fs::read_to_string(runtime_dir.join(PID_FILE)).ok()?;
    raw.trim().parse::<u32>().ok()
}

pub(crate) fn process_exists(pid: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if handle.is_null() {
            return false;
        }

        let mut exit_code = 0;
        let result = unsafe { GetExitCodeProcess(handle, &mut exit_code) };
        let _ = unsafe { CloseHandle(handle) };
        return result != 0 && exit_code == STILL_ACTIVE as u32;
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("kill")
            .arg("-0")
            .arg(pid.to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
}
