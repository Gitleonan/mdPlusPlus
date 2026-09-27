mod commands;
mod watcher;

use tauri::{Emitter, Manager, RunEvent};
use watcher::WatcherState;

/// 判断路径是否以 .md / .markdown 结尾（不区分大小写，Windows 上 README.MD 很常见）
fn has_markdown_ext(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

/// 从 argv 中提取 .md / .markdown 文件路径（跳过 argv[0] 即 exe 路径）。
fn collect_md_files(args: Vec<String>) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter(|a| has_markdown_ext(a))
        .collect()
}

/// 把 macOS Apple Event 传来的 file:// URL 转成本地路径，并只保留 .md / .markdown。
/// macOS 访达打开文件时，文件路径以 `file://...%20...` 形式经 `application:openURLs:`
/// 传入，既不在 argv 里，也需要 percent-decode 才能拿到真实路径。
fn urls_to_md_paths(urls: Vec<url::Url>) -> Vec<String> {
    urls.into_iter()
        .filter(|u| u.scheme() == "file")
        .filter_map(|u| u.to_file_path().ok())
        .filter(|p| has_markdown_ext(&p.to_string_lossy()))
        .map(|p| p.to_string_lossy().to_string())
        .collect()
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // 单实例：必须第一个注册。第二次启动时拦截，把 argv 转发给已运行实例，新进程自动退出。
    // 仅桌面端启用（移动端不支持），cfg(not(mobile)) 与 Cargo.toml 里的桌面端依赖声明一致。
    #[cfg(not(mobile))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let files = collect_md_files(argv);
            if !files.is_empty() {
                // 前端已挂载（拉取过启动文件）则直接 emit；冷启动途中尚未就绪则先暂存，
                // 等前端挂载后由 get_startup_files 取走，避免 emit 早于监听注册而丢失。
                // 两路都靠前端的 openTab 按路径去重。
                if app.state::<commands::files::StartupFiles>().stash(&files) {
                    let _ = app.emit("open-on-startup", &files);
                }
            }
            // 程序已运行但不在前台时（如双击 .md 文件唤起），把窗口拉回前台，
            // 否则文件会打开在后台不可见的窗口里。
            // show + set_focus 适配最小化与"失焦未最小化"两种情况。
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    // 首次启动传入的文件：在 build() 之前注册状态，保证任何回调（单实例转发、
    // macOS RunEvent::Opened、前端的 get_startup_files）都不会遇到状态缺失。
    let startup_files = collect_md_files(std::env::args().collect());

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(commands::files::StartupFiles::new(startup_files))
        .manage(WatcherState::new())
        .setup(|app| {
            // debug 模式启用日志
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::files::read_text_file,
            commands::files::get_startup_files,
            commands::files::write_text_file,
            commands::files::resolve_image,
            commands::files::list_custom_themes,
            commands::files::save_custom_theme,
            commands::files::read_custom_theme,
            commands::files::delete_custom_theme,
            commands::files::get_app_data_dir,
            commands::opener::open_containing_folder,
            commands::opener::open_file_with_system,
            commands::opener::check_file_association,
        commands::opener::register_file_association,
            commands::recent::list_recent,
            commands::recent::add_recent,
            watcher::watch_files,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // macOS：访达双击打开 .md 时，文件路径经 Apple Event
            // `application:openURLs:` 传入，既不在 argv 里（导致 argv 方案失效），
            // 也需把 file:// URL 解析为本地路径。这里统一捕获并转发给前端。
            #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
            if let RunEvent::Opened { urls } = event {
                let files = urls_to_md_paths(urls);
                if !files.is_empty() {
                    // 已运行实例的前端早已挂载监听，可直接 emit；冷启动时前端可能尚未就绪，
                    // 此时只暂存，等前端挂载后由 get_startup_files 取走（两路靠 openTab 去重）。
                    if app_handle
                        .state::<commands::files::StartupFiles>()
                        .stash(&files)
                    {
                        let _ = app_handle.emit("open-on-startup", &files);
                    }
                }
            }
            let _ = app_handle; // 非 macOS 平台占位，避免未使用告警
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn skips_argv0_and_non_markdown_arguments() {
        let files = collect_md_files(args(&[
            "/Applications/md++.app/Contents/MacOS/md++",
            "--flag",
            "/docs/a.md",
            "/docs/notes.markdown",
            "/docs/readme.txt",
        ]));
        assert_eq!(files, args(&["/docs/a.md", "/docs/notes.markdown"]));
    }

    #[test]
    fn matches_markdown_extension_case_insensitively() {
        let files = collect_md_files(args(&[
            "md++.exe",
            "C:\\docs\\README.MD",
            "C:\\docs\\Notes.Markdown",
            "C:\\docs\\README.MD.bak",
        ]));
        assert_eq!(
            files,
            args(&["C:\\docs\\README.MD", "C:\\docs\\Notes.Markdown"])
        );
    }

    #[test]
    fn turns_finder_file_urls_into_decoded_local_paths() {
        let urls = vec![
            url::Url::parse("file:///Users/x/my%20note.md").unwrap(),
            url::Url::parse("file:///Users/x/notes.markdown").unwrap(),
            url::Url::parse("file:///Users/x/image.png").unwrap(),
            url::Url::parse("https://example.com/remote.md").unwrap(),
        ];
        assert_eq!(
            urls_to_md_paths(urls),
            args(&["/Users/x/my note.md", "/Users/x/notes.markdown"])
        );
    }
}
