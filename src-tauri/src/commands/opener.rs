#[cfg(target_os = "windows")]
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Command;
#[cfg(target_os = "macos")]
use std::io::Write;

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
#[tauri::command]
pub async fn check_file_association() -> Result<bool, String> {
	#[cfg(target_os = "windows")]
	{
		// 检查注册表：HKCU\Software\Classes\.md 的默认值是否为 "MdppMarkdown"
		let output = Command::new("reg")
			.args(["query", r"HKCU\Software\Classes\.md", "/ve"])
			.output()
			.map_err(|e| format!("查询注册表失败: {}", e))?;
		if output.status.success() {
			let stdout = String::from_utf8_lossy(&output.stdout);
			return Ok(stdout.contains("MdppMarkdown"));
		}
		return Ok(false);
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
#[tauri::command]
pub async fn register_file_association() -> Result<(), String> {
	#[cfg(target_os = "windows")]
	{
		let exe_path = std::env::current_exe()
			.map_err(|e| format!("获取程序路径失败: {}", e))?;
		let exe_str = exe_path.to_string_lossy().to_string();

		let commands = [
			// 右键菜单"用 md++ 打开"
			(r"HKCU\Software\Classes\.md\shell\OpenWithMdpp", "/ve", "用 md++ 打开"),
			(r"HKCU\Software\Classes\.md\shell\OpenWithMdpp\command", "/ve", &format!("\"{}\" \"%1\"", exe_str)),
			(r"HKCU\Software\Classes\.markdown\shell\OpenWithMdpp", "/ve", "用 md++ 打开"),
			(r"HKCU\Software\Classes\.markdown\shell\OpenWithMdpp\command", "/ve", &format!("\"{}\" \"%1\"", exe_str)),
			// 默认打开方式
			(r"HKCU\Software\Classes\.md", "/ve", "MdppMarkdown"),
			(r"HKCU\Software\Classes\MdppMarkdown", "/ve", "Markdown 文件"),
			(r"HKCU\Software\Classes\MdppMarkdown\DefaultIcon", "/ve", &format!("\"{}\",0", exe_str)),
			(r"HKCU\Software\Classes\MdppMarkdown\shell\open\command", "/ve", &format!("\"{}\" \"%1\"", exe_str)),
			(r"HKCU\Software\Classes\.markdown", "/ve", "MdppMarkdown"),
		];

		for (key, value_name, data) in &commands {
			let mut cmd = Command::new("reg");
			cmd.arg("add").arg(key);
			if *value_name == "/ve" {
				cmd.arg("/ve");
			} else {
				cmd.arg("/v").arg(value_name);
			}
			cmd.arg("/d").arg(data)
			   .arg("/f");
			let output = cmd.output().map_err(|e| format!("执行注册表命令失败: {}", e))?;
			if !output.status.success() {
				let stderr = String::from_utf8_lossy(&output.stderr);
				return Err(format!("注册表写入失败: {}", stderr));
			}
		}

		Ok(())
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

#[cfg(target_os = "windows")]
fn reveal_path(path: &Path) -> Result<(), String> {
	let mut select_arg = OsString::from("/select,");
	select_arg.push(path.as_os_str());
	Command::new("explorer.exe")
		.arg(select_arg)
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
