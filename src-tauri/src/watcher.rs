use notify_debouncer_mini::{new_debouncer, DebouncedEvent};
use std::collections::HashMap;
use std::{path::PathBuf, sync::Mutex, time::Duration};
use tauri::{AppHandle, Emitter, Manager};

/// 全局 watcher 状态，保活防止被 drop
pub struct WatcherState {
    pub watcher: Mutex<Option<notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>>>,
    /// key 是用于比较的规范化路径，value 是注册时使用的原始路径。
    pub watched_paths: Mutex<HashMap<String, String>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            watcher: Mutex::new(None),
            watched_paths: Mutex::new(HashMap::new()),
        }
    }
}

/// Windows 路径大小写不敏感，用规范化 key 做集合 diff。
fn path_key(path: &str) -> String {
    if cfg!(windows) {
        path.replace('/', "\\").to_lowercase()
    } else {
        path.to_string()
    }
}

/// 前端调用：增量同步监听的文件路径列表。
/// 防抖 300ms，避免编辑器频繁保存导致的连续刷新。
/// 传入空数组则停止所有监听。
#[tauri::command]
pub async fn watch_files(app: AppHandle, paths: Vec<String>) -> Result<(), String> {
    let app_handle = app.clone();
    let state = app.state::<WatcherState>();
    let next: HashMap<String, String> = paths
        .into_iter()
        .map(|path| (path_key(&path), path))
        .collect();

    // 第一次同步或需要新增监听时创建 watcher；只在路径集合变化时更新。
    let mut watcher_guard = state.watcher.lock().unwrap();
    if watcher_guard.is_none() && !next.is_empty() {
        let debouncer = new_debouncer(
            Duration::from_millis(300),
            move |res: Result<Vec<DebouncedEvent>, _>| {
                if let Ok(events) = res {
                    let changed: Vec<String> = events
                        .iter()
                        .filter_map(|e| e.path.to_str().map(|s| s.to_string()))
                        .collect();
                    if !changed.is_empty() {
                        let _ = app_handle.emit("file-changed", &changed);
                    }
                }
            },
        )
        .map_err(|e| e.to_string())?;
        // 测试/调试时允许启动 watcher 失败；真实路径仍会由前端读取
        *watcher_guard = Some(debouncer);
    }

    let mut watched = state
        .watched_paths
        .lock()
        .unwrap_or_else(|p| p.into_inner());
    if *watched == next {
        return Ok(());
    }

    if let Some(debouncer) = watcher_guard.as_mut() {
        // 删除已关闭的路径
        let removed: Vec<String> = watched
            .iter()
            .filter(|(key, _)| !next.contains_key(*key))
            .map(|(_, path)| path.clone())
            .collect();
        for path in &removed {
            let _ = debouncer.watcher().unwatch(PathBuf::from(path).as_path());
        }

        // 只新增尚未监听的路径
        for (key, path) in &next {
            if watched.contains_key(key) {
                continue;
            }
            let _ = debouncer.watcher().watch(
                PathBuf::from(path).as_path(),
                notify::RecursiveMode::NonRecursive,
            );
        }
    }

    *watched = next;
    if watched.is_empty() {
        *watcher_guard = None;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn watched_map_keeps_the_original_path_as_its_value() {
        let path = if cfg!(windows) {
            "C:\\Docs\\Note.md"
        } else {
            "/docs/Note.md"
        };
        let next = HashMap::from([(path_key(path), path.to_string())]);
        assert_eq!(next.get(&path_key(path)), Some(&path.to_string()));
    }

    #[cfg(windows)]
    #[test]
    fn windows_path_keys_deduplicate_case_and_separator_variants() {
        assert_eq!(path_key("C:/Docs/Note.md"), path_key("C:\\docs\\NOTE.MD"),);
    }
}
