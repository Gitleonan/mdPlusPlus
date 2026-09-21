mod commands;
mod watcher;

use tauri::{Emitter, Manager, RunEvent};
use watcher::WatcherState;

/// 从 argv 中提取 .md / .markdown 文件路径（跳过 argv[0] 即 exe 路径）。
fn collect_md_files(args: Vec<String>) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter(|a| a.ends_with(".md") || a.ends_with(".markdown"))
        .collect()
}

/// 把 macOS Apple Event 传来的 file:// URL 转成本地路径，并只保留 .md / .markdown。
/// macOS 访达打开文件时，文件路径以 `file://...%20...` 形式经 `application:openURLs:`
/// 传入，既不在 argv 里，也需要 percent-decode 才能拿到真实路径。
fn urls_to_md_paths(urls: Vec<url::Url>) -> Vec<String> {
    urls.into_iter()
        .filter(|u| u.scheme() == "file")
        .filter_map(|u| u.to_file_path().ok())
        .filter(|p| {
            let s = p.to_string_lossy();
            s.ends_with(".md") || s.ends_with(".markdown")
        })
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
                // 写入启动文件列表兜底：若前端还没挂好监听，emit 会丢，
                // 前端挂载后的 get_startup_files 拉取能补上（两路靠 openTab 去重）
                if let Some(state) = app.try_state::<commands::files::StartupFiles>() {
                    state
                        .0
                        .lock()
                        .unwrap_or_else(|p| p.into_inner())
                        .extend(files.iter().cloned());
                }
                // 已运行实例的前端早已挂载监听，可直接 emit，无需延迟
                let _ = app.emit("open-on-startup", &files);
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

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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

            // 首次启动：把命令行传入的 .md/.markdown 存入状态，
            // 前端挂载后主动拉取（替代定时 emit——webview 加载慢于定时时事件会丢）
            let startup_files = collect_md_files(std::env::args().collect());
            app.manage(commands::files::StartupFiles(std::sync::Mutex::new(
                startup_files,
            )));

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
                    // 状态兜底：冷启动时前端可能尚未就绪，emit 会丢，
                    // 挂载后的 get_startup_files 拉取能补上（两路靠 openTab 去重）
                    if let Some(state) = app_handle
                        .try_state::<commands::files::StartupFiles>()
                    {
                        state
                            .0
                            .lock()
                            .unwrap_or_else(|p| p.into_inner())
                            .extend(files.iter().cloned());
                    }
                    // 已运行实例的前端早已挂载监听；冷启动时前端可能尚未就绪，
                    // 延迟一小段以覆盖两种情形（前端 openTab 按路径去重，重复也无害）。
                    let handle = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                        let _ = handle.emit("open-on-startup", &files);
                    });
                }
            }
            let _ = app_handle; // 非 macOS 平台占位，避免未使用告警
        });
}
