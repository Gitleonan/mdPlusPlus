import { create } from 'zustand';
import { getVersion } from '@tauri-apps/api/app';
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  releaseUpdate,
  type Update,
} from '../ipc/updater';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'up-to-date'
  | 'error'
  | 'unsupported';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  date: string | null;
  body: string | null;
}

interface UpdateState {
  status: UpdateStatus;
  info: UpdateInfo | null;
  /** 当前安装的版本；getVersion() 失败时为 null */
  currentVersion: string | null;
  /** 检查到的最新版本；已是最新时与 currentVersion 相同 */
  latestVersion: string | null;
  /** 0–1；total 未知时为 null，表示按不确定进度展示 */
  progress: number | null;
  downloaded: number;
  total: number | null;
  error: string | null;
  /** 弹窗是否打开——静默检查发现新版本时也会打开，由用户决定 */
  dialogOpen: boolean;

  check: (opts?: { silent?: boolean; currentVersion?: string }) => Promise<void>;
  install: () => Promise<void>;
  openDialog: () => void;
  closeDialog: () => void;
  reset: () => void;
}

/**
 * Update 对象不适合放进 zustand（含方法、非纯数据），
 * 用模块级变量持有，store 只保存可序列化的展示状态。
 */
let pendingUpdate: Update | null = null;
/** 并发保护：静默检查和手动检查可能同时触发 */
let inFlight = false;

const NETWORK_HINT =
  '无法连接到更新服务器，请检查网络后重试。GitHub 在部分网络环境下访问不稳定。';

function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/network|fetch|connect|timeout|timed out|dns|request/i.test(message)) return NETWORK_HINT;
  if (/valid pubkey|pubkey/i.test(message)) {
    return '尚未配置更新公钥（plugins.updater.pubkey），当前构建无法验证更新包签名。';
  }
  if (/signature/i.test(message)) return '更新包签名校验失败，已中止安装。';
  return message;
}

/** 读取当前安装版本；浏览器预览与测试环境没有 Tauri，返回 null */
async function readCurrentVersion(): Promise<string | null> {
  try {
    return await getVersion();
  } catch {
    return null;
  }
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: 'idle',
  info: null,
  currentVersion: null,
  latestVersion: null,
  progress: null,
  downloaded: 0,
  total: null,
  error: null,
  dialogOpen: false,

  async check(opts = {}) {
    if (inFlight) return;
    // 已有待安装的更新时不重复检查，避免丢掉已下载的句柄
    if (get().status === 'downloading' || get().status === 'installing') return;
    inFlight = true;
    const currentVersion = opts.currentVersion ?? (await readCurrentVersion());
    set({ status: 'checking', error: null, currentVersion });
    try {
      const update = await checkForUpdate();
      if (!update) {
        // 没有更新时更新器不返回版本信息，最新版本即当前版本
        set({ status: 'up-to-date', info: null, latestVersion: currentVersion });
        return;
      }
      await releaseUpdate(pendingUpdate);
      pendingUpdate = update;
      set({
        status: 'available',
        latestVersion: update.version,
        info: {
          version: update.version,
          currentVersion: update.currentVersion || currentVersion || '—',
          date: update.date ?? null,
          body: update.body ?? null,
        },
        // 静默检查不弹窗，只在界面上留一个可点的「有更新」标记；用户主动检查才直接展开
        dialogOpen: !opts.silent,
      });
    } catch (err) {
      const message = describeError(err);
      // 静默检查失败不打扰用户，只在控制台留痕
      if (opts.silent) {
        console.warn('[updater] silent check failed:', err);
        set({ status: 'idle' });
      } else {
        set({ status: 'error', error: message });
      }
    } finally {
      inFlight = false;
    }
  },

  async install() {
    if (!pendingUpdate) {
      set({ status: 'error', error: '更新资源已失效，请重新检查更新。' });
      return;
    }
    set({ status: 'downloading', progress: null, downloaded: 0, total: null, error: null });
    try {
      await downloadAndInstallUpdate(pendingUpdate, {
        onEvent: (event, { downloaded, total }) => {
          if (event === 'finished') {
            set({ status: 'installing', progress: 1, downloaded, total });
            return;
          }
          set({
            status: 'downloading',
            progress: total && total > 0 ? Math.min(downloaded / total, 1) : null,
            downloaded,
            total,
          });
        },
      });
      // 正常情况下 relaunch() 已接管，执行到这里说明进程仍在
      set({ status: 'installing' });
    } catch (err) {
      console.error('[updater] install failed:', err);
      set({ status: 'error', error: describeError(err) });
    } finally {
      pendingUpdate = null;
    }
  },

  openDialog() {
    const { status } = get();
    // up-to-date / error 也允许打开，用来解释检查结果
    if (status === 'checking') return;
    set({ dialogOpen: true });
  },

  closeDialog() {
    // 下载安装过程中不允许关闭，避免中途丢失进度
    if (get().status === 'downloading' || get().status === 'installing') return;
    set({ dialogOpen: false, ...(get().status === 'error' ? { status: 'idle', error: null } : {}) });
  },

  reset() {
    set({
      status: 'idle',
      info: null,
      latestVersion: null,
      progress: null,
      downloaded: 0,
      total: null,
      error: null,
      dialogOpen: false,
    });
  },
}));

/** 测试用：清空模块级句柄 */
export function __resetPendingUpdate() {
  pendingUpdate = null;
  inFlight = false;
}
