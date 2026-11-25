import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { isTauri } from '@tauri-apps/api/core';

export type { Update };

/** isTauri() 在非 Tauri 环境（浏览器预览、测试）下可能自身抛错，统一包一层 */
function inTauri(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}

/** 下载进度回调：total 在有些 CDN 响应里拿不到（contentLength 为 undefined） */
export interface DownloadProgress {
  downloaded: number;
  total: number | null;
}

export type DownloadEvent = 'started' | 'progress' | 'finished';

export interface DownloadHandlers {
  onEvent?: (event: DownloadEvent, progress: DownloadProgress) => void;
}

/**
 * 检查更新。返回 null 表示已是最新。
 * 端点由 tauri.conf.json 的 plugins.updater.endpoints 决定（GitHub Releases）。
 */
export async function checkForUpdate(): Promise<Update | null> {
  if (!inTauri()) return null;
  const update = await check({ timeout: 15000 });
  return update ?? null;
}

/**
 * 下载并安装更新，安装完成后重启应用。
 * 注意：Windows 上安装程序会先结束当前进程，所以 relaunch() 之后进程可能已不存在，
 * 这里把「进程已退出」类错误视为成功，避免界面报错。
 */
export async function downloadAndInstallUpdate(
  update: Update,
  handlers: DownloadHandlers = {},
): Promise<void> {
  let downloaded = 0;
  let total: number | null = null;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        total = event.data.contentLength ?? null;
        handlers.onEvent?.('started', { downloaded, total });
        break;
      case 'Progress':
        downloaded += event.data.chunkLength;
        handlers.onEvent?.('progress', { downloaded, total });
        break;
      case 'Finished':
        handlers.onEvent?.('finished', { downloaded: total ?? downloaded, total });
        break;
    }
  });

  try {
    await relaunch();
  } catch (err) {
    // Windows 安装完成后旧进程可能已被结束，重启失败属于预期内
    const message = err instanceof Error ? err.message : String(err);
    if (!/exit|terminate|not running|closed/i.test(message)) throw err;
  }
}

/** 放弃一个已下载的 Update 资源，避免句柄泄漏 */
export async function releaseUpdate(update: Update | null): Promise<void> {
  if (!update) return;
  try {
    await update.close();
  } catch {
    /* close 在旧版本上没有或已关闭，忽略 */
  }
}
