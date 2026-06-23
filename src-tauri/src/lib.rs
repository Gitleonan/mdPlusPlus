mod commands;
mod watcher;

use tauri::Emitter;
use watcher::WatcherState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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

            // 解析命令行参数：把传入的 .md/.markdown 文件通过事件发给前端
            let args: Vec<String> = std::env::args().collect();
            let startup_files: Vec<String> = args
                .into_iter()
                .skip(1)
                .filter(|a| a.ends_with(".md") || a.ends_with(".markdown"))
                .collect();
            if !startup_files.is_empty() {
                // 延迟一点确保前端已挂载监听
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    let _ = handle.emit("open-on-startup", &startup_files);
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::files::read_text_file,
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
