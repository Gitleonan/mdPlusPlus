#[cfg(target_os = "windows")]
use std::ffi::OsString;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
#[cfg(target_os = "macos")]
use std::io::Write;

/// 禁止子进程弹出控制台黑窗（仅 Windows 生效）
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 用系统默认程序打开任意文件（绕过 opener plugin 的路径 ACL）
/// 适用于打开 app data dir 下的临时导出文件等不受 opener plugin 信任的路径
#[tauri::command]
pub async fn open_file_with_system(path: String) -> Result<(), String> {
	if path.trim().is_empty() {
		return Err("文件路径不能为空".to_string());
	}
	let path = PathBuf::from(path);
	tauri::async_runtime::spawn_blocking(move || open_file(&path))
		.await
		.map_err(|e| format!("打开文件失败: {}", e))?
}

#[cfg(target_os = "windows")]
fn open_file(path: &Path) -> Result<(), String> {
	Command::new("cmd")
		.args(["/C", "start", "", "/B"])
		.arg(path)
		.creation_flags(CREATE_NO_WINDOW)
		.spawn()
		.map_err(|e| format!("启动关联程序失败: {}", e))?;
	Ok(())
}

#[cfg(target_os = "macos")]
fn open_file(path: &Path) -> Result<(), String> {
	Command::new("open")
		.arg(path)
		.spawn()
		.map_err(|e| format!("启动关联程序失败: {}", e))?;
	Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_file(path: &Path) -> Result<(), String> {
	Command::new("xdg-open")
		.arg(path)
		.spawn()
		.map_err(|e| format!("启动关联程序失败: {}", e))?;
	Ok(())
}

#[tauri::command]
pub async fn open_containing_folder(path: String) -> Result<(), String> {
	if path.trim().is_empty() {
		return Err("文件路径不能为空".to_string());
	}

	let path = PathBuf::from(path);
	tauri::async_runtime::spawn_blocking(move || reveal_path(&path))
		.await
		.map_err(|e| format!("打开所在位置失败: {}", e))?
}

/// 检查 md++ 是否为 .md 文件的默认打开程序
///
/// 与「双击实际行为」对齐：解析 UserChoice → ProgID → shell\open\command → exe 路径，
/// 并与当前 exe 比对，避免「残留字符串在但 ProgID 已删」这类误报。
#[tauri::command]
pub async fn check_file_association() -> Result<bool, String> {
	#[cfg(target_os = "windows")]
	{
		tauri::async_runtime::spawn_blocking(check_file_association_windows)
			.await
			.map_err(|e| format!("检测默认程序失败: {}", e))?
	}

	#[cfg(target_os = "macos")]
	{
		check_file_association_macos()
	}

	#[cfg(all(unix, not(target_os = "macos")))]
	{
		Ok(false)
	}
}

/// 将 md++ 注册为 .md / .markdown 文件的默认打开方式
///
/// 两步走：
/// 1. 用 `reg add` 写入 ProgID 定义 (MdppMarkdown)、OpenWithProgids、右键菜单、
///    RegisteredApplications/Capabilities —— 让 md++ 出现在「打开方式」与系统默认应用列表。
/// 2. 用系统 COM API `IApplicationAssociationRegistration::SetAppAsDefault` 写入
///    带 Hash 校验的 UserChoice 键 —— 这一步决定双击时实际打开哪个程序，
///    无法用 `reg add` 伪造（Hash 算法非公开且会变动）。
#[tauri::command]
pub async fn register_file_association() -> Result<(), String> {
	#[cfg(target_os = "windows")]
	{
		tauri::async_runtime::spawn_blocking(register_file_association_windows)
			.await
			.map_err(|e| format!("注册默认程序失败: {}", e))?
	}

	#[cfg(target_os = "macos")]
	{
		register_file_association_macos()
	}

	#[cfg(all(unix, not(target_os = "macos")))]
	{
		Err("文件关联注册仅在 Windows / macOS 上支持".to_string())
	}
}

#[cfg(target_os = "macos")]
fn register_file_association_macos() -> Result<(), String> {
	let exe_path = std::env::current_exe()
		.map_err(|e| format!("获取程序路径失败: {}", e))?;
	// .app bundle 路径: <...>/md++.app/Contents/MacOS/md++
	let bundle_path = exe_path
		.parent()  // MacOS/
		.and_then(|p| p.parent())  // Contents/
		.and_then(|p| p.parent())  // md++.app
		.ok_or("无法定位 app bundle 目录")?;

	// Swift 脚本：先用 LSRegisterURL 注册 bundle，再用 NSWorkspace API 设为默认
	let script = format!(
		r##"import Cocoa
import CoreServices

let bundleURL = URL(fileURLWithPath: "{bundle}")
let semaphore = DispatchSemaphore(value: 0)
var errorMsg: String? = nil

// 1) 注册应用到 Launch Services
let reg = LSRegisterURL(bundleURL as CFURL, true)
guard reg == 0 else {{
    fputs("LSRegisterURL 失败: \(reg)\n", stderr)
    exit(1)
}}

// 2) 创建临时文件（内容必须为有效 Markdown，否则系统无法识别文件类型）
let mdFile = URL(fileURLWithPath: "/tmp/mdpp_default.md")
let mdFile2 = URL(fileURLWithPath: "/tmp/mdpp_default.markdown")
try "# md++".write(to: mdFile, atomically: true, encoding: .utf8)
try "# md++".write(to: mdFile2, atomically: true, encoding: .utf8)

let workspace = NSWorkspace.shared

// 3) 设为 .md 默认打开程序
workspace.setDefaultApplication(at: bundleURL, toOpenFileAt: mdFile) {{ err in
    if let e = err {{ errorMsg = ".md: \(e.localizedDescription)" }}
    semaphore.signal()
}}
semaphore.wait()

// 4) 设为 .markdown 默认打开程序
workspace.setDefaultApplication(at: bundleURL, toOpenFileAt: mdFile2) {{ err in
    if let e = err {{ errorMsg = (errorMsg ?? "") + "\n.markdown: \(e.localizedDescription)" }}
    semaphore.signal()
}}
semaphore.wait()

try? FileManager.default.removeItem(at: mdFile)
try? FileManager.default.removeItem(at: mdFile2)

if let msg = errorMsg {{
    fputs(msg, stderr)
    exit(1)
}}
print("done")
"##,
		bundle = bundle_path.to_string_lossy(),
	);

	let tmp_dir = std::env::temp_dir();
	let script_path = tmp_dir.join("mdpp_register_default.swift");
	{
		let mut f = std::fs::File::create(&script_path)
			.map_err(|e| format!("创建临时脚本失败: {}", e))?;
		f.write_all(script.as_bytes())
			.map_err(|e| format!("写入临时脚本失败: {}", e))?;
	}

	let output = Command::new("swift")
		.arg(&script_path)
		.output()
		.map_err(|e| format!("执行 swift 失败: {}", e))?;

	let _ = std::fs::remove_file(&script_path);

	if !output.status.success() {
		let stderr = String::from_utf8_lossy(&output.stderr);
		return Err(format!("设置默认打开方式失败: {}", stderr));
	}

	Ok(())
}

#[cfg(target_os = "macos")]
fn check_file_association_macos() -> Result<bool, String> {
	let exe_path = std::env::current_exe()
		.map_err(|e| format!("获取程序路径失败: {}", e))?;
	let bundle_path = exe_path
		.parent()
		.and_then(|p| p.parent())
		.and_then(|p| p.parent())
		.ok_or("无法定位 app bundle 目录")?;

	let script = format!(
		r##"import Cocoa
let testFile = URL(fileURLWithPath: "/tmp/mdpp_check_default.md")
try "# md++ check".write(to: testFile, atomically: true, encoding: .utf8)
defer {{ try? FileManager.default.removeItem(at: testFile) }}

if let appURL = NSWorkspace.shared.urlForApplication(toOpen: testFile) {{
    let bundleURL = URL(fileURLWithPath: "{bundle}")
    // 比较 bundle identifier 而非路径（路径可能因安装位置不同而变化）
    let actualBundle = Bundle(url: appURL)
    let expectedBundle = Bundle(url: bundleURL)
    if actualBundle?.bundleIdentifier == expectedBundle?.bundleIdentifier {{
        print("true")
    }} else {{
        print("false")
    }}
}} else {{
    print("false")
}}
"##,
		bundle = bundle_path.to_string_lossy(),
	);

	let tmp_dir = std::env::temp_dir();
	let script_path = tmp_dir.join("mdpp_check_default.swift");
	{
		let mut f = std::fs::File::create(&script_path)
			.map_err(|e| format!("创建临时脚本失败: {}", e))?;
		f.write_all(script.as_bytes())
			.map_err(|e| format!("写入临时脚本失败: {}", e))?;
	}

	let output = Command::new("swift")
		.arg(&script_path)
		.output()
		.map_err(|e| format!("执行 swift 失败: {}", e))?;

	let _ = std::fs::remove_file(&script_path);

	if !output.status.success() {
		let stderr = String::from_utf8_lossy(&output.stderr);
		return Err(format!("检查默认打开方式失败: {}", stderr));
	}

	let stdout = String::from_utf8_lossy(&output.stdout);
	Ok(stdout.trim() == "true")
}

/// 读取 HKCU 注册表某键的默认值（REG_SZ）。键不存在或无值时返回 None。
#[cfg(target_os = "windows")]
fn reg_query_default(key: &str) -> Option<String> {
	let output = Command::new("reg")
		.args(["query", key, "/ve"])
		.creation_flags(CREATE_NO_WINDOW)
		.output()
		.ok()?;
	if !output.status.success() {
		return None;
	}
	// 输出形如：
	//   HKEY_CURRENT_USER\...\key
	//       (默认)    REG_SZ    MdppMarkdown
	// 中文系统下默认值名是 "(默认)"，英文是 "(Default)"，按 REG_SZ 行提取最稳。
	let stdout = String::from_utf8_lossy(&output.stdout);
	for line in stdout.lines() {
		let line = line.trim();
		if line.contains("REG_SZ") {
			if let Some(idx) = line.find("REG_SZ") {
				let val = line[idx + "REG_SZ".len()..].trim();
				if !val.is_empty() {
					return Some(val.to_string());
				}
			}
		}
	}
	None
}

/// 从 `"<exe>" "%1"` 形式的 command 字符串中提取 exe 路径。
/// 处理带引号/不带引号两种写法，忽略 `%1` 等参数。
#[cfg(target_os = "windows")]
fn extract_exe_from_command(cmd: &str) -> Option<PathBuf> {
	let cmd = cmd.trim();
	let exe = if let Some(rest) = cmd.strip_prefix('"') {
		rest.split('"').next()?
	} else {
		cmd.split_whitespace().next()?
	};
	Some(PathBuf::from(exe))
}

/// 规范化两个 exe 路径后比较是否指向同一文件（大小写不敏感、忽略 \\?\ 前缀）。
#[cfg(target_os = "windows")]
fn exe_paths_match(a: &Path, b: &Path) -> bool {
	let canon = |p: &Path| {
		p.to_string_lossy()
			.trim_start_matches(r"\\?\")
			.trim_start_matches(r"\??\")
			.to_lowercase()
	};
	canon(a) == canon(b)
}

/// Windows 检测：完整解析 UserChoice → ProgID → shell\open\command → exe 路径，
/// 与当前 exe 比对。任一环缺失即返回 false。
#[cfg(target_os = "windows")]
fn check_file_association_windows() -> Result<bool, String> {
	let current_exe = std::env::current_exe()
		.map_err(|e| format!("获取程序路径失败: {}", e))?;

	for ext in [".md", ".markdown"] {
		// 1. 优先读 UserChoice.ProgId（决定双击行为的键）
		let user_choice_key = format!(
			r"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\{}\UserChoice",
			ext
		);
		let mut progid = reg_query_default(&user_choice_key);
		// 默认值名是 ProgId，上面读的是 (默认)，可能为空 —— 再按值名 ProgId 读一次
		if progid.is_none() {
			progid = reg_query_named(&user_choice_key, "ProgId");
		}

		// 2. 回退读旧式关联 HKCU\Software\Classes\.ext 默认值
		if progid.is_none() {
			progid = reg_query_default(&format!(r"HKCU\Software\Classes\{}", ext));
		}

		let progid = match progid {
			Some(p) if !p.is_empty() => p,
			_ => return Ok(false),
		};

		// 3. 解析 ProgID 的 shell\open\command 默认值，提取 exe 路径
		let command_key = format!(r"HKCU\Software\Classes\{}\shell\open\command", progid);
		let command = match reg_query_default(&command_key) {
			Some(c) if !c.is_empty() => c,
			_ => return Ok(false),
		};
		let assoc_exe = match extract_exe_from_command(&command) {
			Some(p) => p,
			None => return Ok(false),
		};

		// 4. 与当前 exe 比对
		if !exe_paths_match(&assoc_exe, &current_exe) {
			return Ok(false);
		}
	}
	Ok(true)
}

/// 读取注册表某键下指定值名（REG_SZ）。键不存在或无值时返回 None。
#[cfg(target_os = "windows")]
fn reg_query_named(key: &str, value_name: &str) -> Option<String> {
	let output = Command::new("reg")
		.args(["query", key, "/v", value_name])
		.creation_flags(CREATE_NO_WINDOW)
		.output()
		.ok()?;
	if !output.status.success() {
		return None;
	}
	let stdout = String::from_utf8_lossy(&output.stdout);
	for line in stdout.lines() {
		let line = line.trim();
		if line.contains("REG_SZ") {
			if let Some(idx) = line.find("REG_SZ") {
				let val = line[idx + "REG_SZ".len()..].trim();
				if !val.is_empty() {
					return Some(val.to_string());
				}
			}
		}
	}
	None
}

/// 写入一条注册表字符串值（HKCU）。失败返回中文错误。
#[cfg(target_os = "windows")]
fn reg_add_str(key: &str, value_name: Option<&str>, data: &str) -> Result<(), String> {
	let mut cmd = Command::new("reg");
	cmd.arg("add").arg(key);
	match value_name {
		Some(name) => {
			cmd.arg("/v").arg(name);
		}
		None => {
			cmd.arg("/ve");
		}
	}
	cmd.arg("/d").arg(data).arg("/f");
	cmd.creation_flags(CREATE_NO_WINDOW);
	let output = cmd.output().map_err(|e| format!("执行注册表命令失败: {}", e))?;
	if !output.status.success() {
		let stderr = String::from_utf8_lossy(&output.stderr);
		return Err(format!("注册表写入失败: {}", stderr));
	}
	Ok(())
}

/// Windows 注册：写入 ProgID 定义链并清除残留 UserChoice，使双击回退到我们的 ProgID。
///
/// 不使用 `IApplicationAssociationRegistration::SetAppAsDefault`：该 API 在
/// Win10 1803+ 因 UserChoice Hash 校验加强而返回 E_FAIL (0x80004005)，且 Hash 算法
/// 非公开无法伪造。可靠做法是删除 UserChoice 键，让 Explorer 回退到
/// `HKCR\.ext → ProgID` 映射（由步骤 1 写入）。
#[cfg(target_os = "windows")]
fn register_file_association_windows() -> Result<(), String> {
	use windows::Win32::UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_IDLIST};

	let exe_path = std::env::current_exe()
		.map_err(|e| format!("获取程序路径失败: {}", e))?;
	let exe_str = exe_path.to_string_lossy().to_string();
	let open_cmd = format!("\"{}\" \"%1\"", exe_str);
	let icon_cmd = format!("\"{}\",0", exe_str);

	// --- 步骤 1：写入 ProgID 定义、扩展名默认值、OpenWithProgids、右键菜单、Capabilities ---
	// ProgID：MdppMarkdown
	reg_add_str(r"HKCU\Software\Classes\MdppMarkdown", None, "Markdown 文件")?;
	reg_add_str(
		r"HKCU\Software\Classes\MdppMarkdown",
		Some("FriendlyTypeName"),
		"Markdown 文件",
	)?;
	reg_add_str(r"HKCU\Software\Classes\MdppMarkdown\DefaultIcon", None, &icon_cmd)?;
	reg_add_str(r"HKCU\Software\Classes\MdppMarkdown\shell", None, "open")?;
	reg_add_str(
		r"HKCU\Software\Classes\MdppMarkdown\shell\open\command",
		None,
		&open_cmd,
	)?;

	// 扩展名默认值 + OpenWithProgids + 右键菜单（.md / .markdown）
	for ext in [".md", ".markdown"] {
		let ext_key = format!(r"HKCU\Software\Classes\{}", ext);
		reg_add_str(&ext_key, None, "MdppMarkdown")?;
		reg_add_str(
			&format!(r"{}\OpenWithProgids", ext_key),
			Some("MdppMarkdown"),
			"",
		)?;
		reg_add_str(
			&format!(r"{}\shell\OpenWithMdpp", ext_key),
			None,
			"用 md++ 打开",
		)?;
		reg_add_str(
			&format!(r"{}\shell\OpenWithMdpp\command", ext_key),
			None,
			&open_cmd,
		)?;
	}

	// Capabilities：让 md++ 出现在系统「默认应用」列表
	reg_add_str(
		r"HKCU\Software\md++\Capabilities",
		Some("ApplicationName"),
		"md++",
	)?;
	reg_add_str(
		r"HKCU\Software\md++\Capabilities",
		Some("ApplicationDescription"),
		"Windows 轻量便捷的 Markdown 阅读器",
	)?;
	reg_add_str(
		r"HKCU\Software\md++\Capabilities\FileAssociations",
		Some(".md"),
		"MdppMarkdown",
	)?;
	reg_add_str(
		r"HKCU\Software\md++\Capabilities\FileAssociations",
		Some(".markdown"),
		"MdppMarkdown",
	)?;
	reg_add_str(
		r"HKCU\Software\RegisteredApplications",
		Some("md++"),
		"Software\\md++\\Capabilities",
	)?;

	// --- 步骤 2：删除残留 UserChoice，使 Explorer 回退到上面的 .ext → ProgID 映射 ---
	// UserChoice 带 Hash 校验，无法用 reg add 伪造；直接删除整个键，双击即回退到
	// HKCR\.ext 默认值指向的 ProgID（MdppMarkdown），这是我们写入的可信链。
	for ext in [".md", ".markdown"] {
		let user_choice_key = format!(
			r"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\{}\UserChoice",
			ext
		);
		// /f 忽略「键不存在」错误；忽略执行失败（键可能本就不存在）
			let _ = Command::new("reg")
				.args(["delete", &user_choice_key, "/f"])
				.creation_flags(CREATE_NO_WINDOW)
				.status();
	}

	// --- 步骤 3：刷新 Shell 关联与图标缓存 ---
	// SHCNE_ASSOCCHANGED 通知资源管理器重读关联；若不刷新，旧图标/旧默认可能继续缓存。
	unsafe {
		SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None);
	}

	Ok(())
}

#[cfg(target_os = "windows")]
fn reveal_path(path: &Path) -> Result<(), String> {
	let mut select_arg = OsString::from("/select,");
	select_arg.push(path.as_os_str());
	Command::new("explorer.exe")
		.arg(select_arg)
		.creation_flags(CREATE_NO_WINDOW)
		.spawn()
		.map_err(|e| format!("启动资源管理器失败: {}", e))?;
	Ok(())
}

#[cfg(target_os = "macos")]
fn reveal_path(path: &Path) -> Result<(), String> {
	Command::new("open")
		.arg("-R")
		.arg(path)
		.spawn()
		.map_err(|e| format!("启动 Finder 失败: {}", e))?;
	Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn reveal_path(path: &Path) -> Result<(), String> {
	let target = path.parent().unwrap_or(path);
	Command::new("xdg-open")
		.arg(target)
		.spawn()
		.map_err(|e| format!("启动文件管理器失败: {}", e))?;
	Ok(())
}
