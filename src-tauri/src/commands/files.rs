use base64::{engine::general_purpose, Engine as _};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;

/// 首次启动时命令行传入的 .md/.markdown 文件。
/// 前端挂载后通过 get_startup_files 主动拉取（取完即清），
/// 替代"延迟 N 毫秒 emit"——emit 可能早于前端监听注册而丢失。
pub struct StartupFiles(pub Mutex<Vec<String>>);

/// 读取文件文本内容
#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {}", e))
}

/// 拉取并清空首次启动的文件列表（一次性消费）
#[tauri::command]
pub async fn get_startup_files(state: tauri::State<'_, StartupFiles>) -> Result<Vec<String>, String> {
    let mut files = state.0.lock().map_err(|e| e.to_string())?;
    Ok(std::mem::take(&mut *files))
}

/// 写入文件文本内容
#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("写入文件失败: {}", e))
}

/// 列出自定义主题目录下的 CSS 文件
#[tauri::command]
pub async fn list_custom_themes(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = get_themes_dir(&app)?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("创建主题目录失败: {}", e))?;
    }
    let entries = fs::read_dir(&dir).map_err(|e| format!("读取主题目录失败: {}", e))?;
    let mut names = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".css") {
            names.push(name);
        }
    }
    names.sort();
    Ok(names)
}

/// 保存自定义主题 CSS
#[tauri::command]
pub async fn save_custom_theme(app: tauri::AppHandle, name: String, css: String) -> Result<(), String> {
    let dir = get_themes_dir(&app)?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("创建主题目录失败: {}", e))?;
    }
    // 安全检查：只允许 .css 文件名，禁止路径穿越
    let safe_name = sanitize_filename(&name);
    if !safe_name.ends_with(".css") || safe_name.len() < 5 {
        return Err("无效的主题文件名".to_string());
    }
    let path = dir.join(&safe_name);
    fs::write(&path, &css).map_err(|e| format!("保存主题失败: {}", e))
}

/// 读取自定义主题 CSS
#[tauri::command]
pub async fn read_custom_theme(app: tauri::AppHandle, name: String) -> Result<String, String> {
    let dir = get_themes_dir(&app)?;
    let safe_name = sanitize_filename(&name);
    let path = dir.join(&safe_name);
    fs::read_to_string(&path).map_err(|e| format!("读取主题失败: {}", e))
}

/// 删除自定义主题
#[tauri::command]
pub async fn delete_custom_theme(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let dir = get_themes_dir(&app)?;
    let safe_name = sanitize_filename(&name);
    let path = dir.join(&safe_name);
    fs::remove_file(&path).map_err(|e| format!("删除主题失败: {}", e))
}

/// 获取应用数据目录路径，前端可在此写入缓存文件
#[tauri::command]
pub async fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("获取数据目录失败: {}", e))
}

/// 清理文件名：移除路径分隔符和 .. 防止路径穿越
fn sanitize_filename(name: &str) -> String {
    name.replace('/', "")
        .replace('\\', "")
        .replace("..", "")
}

fn get_themes_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    // 优先使用安装目录下的 themes 子目录
    if let Ok(exe) = std::env::current_exe() {
        if let Some(install_dir) = exe.parent() {
            let themes = install_dir.join("themes");
            // 判断是否在安装目录下运行：检查同目录是否存在平台可执行文件
            // macOS: md++（位于 .app bundle 内部）; Windows: md++.exe
            let is_installed = if cfg!(target_os = "macos") {
                install_dir.join("md++").exists()
            } else {
                install_dir.join("md++.exe").exists()
            };
            if themes.exists() || is_installed {
                if !themes.exists() {
                    std::fs::create_dir_all(&themes)
                        .map_err(|e| format!("创建主题目录失败: {}", e))?;
                }
                return Ok(themes);
            }
        }
    }
    // 开发模式或回退：使用 app data dir
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取数据目录失败: {}", e))?;
    Ok(data_dir.join("themes"))
}

/// 解析图片：网络地址原样返回，本地路径读为 data URL；失败返回占位符
#[tauri::command]
pub async fn resolve_image(md_file_path: String, src: String) -> Result<String, String> {
    if src.starts_with("http://") || src.starts_with("https://") {
        return Ok(src);
    }
    let img_path = resolve_local_path(&md_file_path, &src);
    match fs::read(&img_path) {
        Ok(bytes) => {
            let mime = guess_mime(&img_path);
            let b64 = general_purpose::STANDARD.encode(&bytes);
            Ok(format!("data:{};base64,{}", mime, b64))
        }
        Err(_) => Ok(PLACEHOLDER_DATA_URL.to_string()),
    }
}

/// 解析相对路径（以 MD 文件所在目录为基准）或绝对路径
pub fn resolve_local_path(md_file_path: &str, src: &str) -> PathBuf {
    let p = Path::new(src);
    if p.is_absolute() {
        PathBuf::from(src)
    } else {
        Path::new(md_file_path)
            .parent()
            .unwrap_or(Path::new("."))
            .join(src)
    }
}

/// 根据文件扩展名猜测 MIME 类型
pub fn guess_mime(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

/// 图片不存在时的占位符 data URL（SVG，显示"图片未找到"）
const PLACEHOLDER_DATA_URL: &str = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMTIwIiB2aWV3Qm94PSIwIDAgMjAwIDEyMCI+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIxMjAiIGZpbGw9IiNlZWUiLz48dGV4dCB4PSIxMDAiIHk9IjYwIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+8k+aqOa4heeUqOaIt1xyXG7lm77niYc8L3RleHQ+PC9zdmc+";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_relative_path_against_md_dir() {
        let p = resolve_local_path("/docs/note.md", "./img/a.png");
        assert_eq!(p, PathBuf::from("/docs/./img/a.png"));
    }

    #[test]
    fn resolves_absolute_path_as_is() {
        let p = resolve_local_path("/docs/note.md", "/abs/img/a.png");
        assert_eq!(p, PathBuf::from("/abs/img/a.png"));
    }

    #[test]
    fn guesses_mime_for_common_extensions() {
        assert_eq!(guess_mime(Path::new("a.png")), "image/png");
        assert_eq!(guess_mime(Path::new("a.JPG")), "image/jpeg");
        assert_eq!(guess_mime(Path::new("a.svg")), "image/svg+xml");
        assert_eq!(guess_mime(Path::new("a.xyz")), "application/octet-stream");
    }
}
