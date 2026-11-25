import { useEffect } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { isTauri } from '@tauri-apps/api/core';
import { useUpdateStore } from '../stores/updateStore';

/** isTauri() 在非 Tauri 环境（浏览器预览、测试）下可能自身抛错，统一包一层 */
function inTauri(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}

/** 静默检查的最小间隔：GitHub 未认证请求有频率限制，太频繁也会打扰用户 */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const LAST_CHECK_KEY = 'mdpp.update.lastCheck';
/** 启动后延迟，等首屏渲染和文件打开完成，避免和冷启动争网络与主线程 */
const STARTUP_DELAY_MS = 3000;

/**
 * 启动时静默检查一次更新。
 * 命中间隔则跳过；检查失败不打扰用户（store 内已静默处理）。
 * 用 localStorage 记录时间，跨重启生效。
 */
export function useUpdater() {
  useEffect(() => {
    if (!inTauri()) return;
    // 开发模式下不自动检查：dev 构建的版本号常落后于线上 release，
    // 每次启动都会提示"有新版本"，且请求会污染日志。
    if (import.meta.env.DEV) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const run = async () => {
      let lastCheck = 0;
      try {
        lastCheck = Number(localStorage.getItem(LAST_CHECK_KEY) ?? 0) || 0;
      } catch {
        /* localStorage 不可用时按从未检查处理 */
      }
      if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return;

      const currentVersion = await getVersion().catch(() => undefined);
      if (cancelled) return;

      try {
        localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
      } catch {
        /* 忽略 */
      }

      await useUpdateStore.getState().check({ silent: true, currentVersion });
    };

    timer = setTimeout(() => { void run(); }, STARTUP_DELAY_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);
}

/** 手动检查（关于窗口）——忽略间隔限制，总是实际请求 */
export async function checkForUpdatesManually(): Promise<void> {
  const store = useUpdateStore.getState();
  store.reset();
  store.openDialog();
  await store.check({ silent: false });
  try {
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
  } catch {
    /* 忽略 */
  }
}

/**
 * 仅开发模式：往 store 注入一份假的更新信息，用来预览弹窗与下载动效。
 * 不发起任何网络请求，也不影响生产构建（调用处用 import.meta.env.DEV 包裹）。
 */
export function previewUpdateDialog(): void {
  const store = useUpdateStore.getState();
  store.reset();
  // 模拟下载进度，让动效可完整预览
  const total = 12_345_678;
  let downloaded = 0;
  useUpdateStore.setState({
    status: 'available',
    dialogOpen: true,
    info: {
      version: '0.5.0',
      currentVersion: '0.4.1',
      date: new Date().toISOString(),
      body: [
        '## 新增',
        '- 版本自动更新检测，支持应用内一键升级',
        '- 更新弹窗与标题栏更新提示',
        '- 自定义主题支持导入 CSS 变量覆盖',
        '## 优化',
        '- 提升大文档首次渲染速度',
        '- 修正深色模式下代码块行号对比度偏低的问题',
        '## 修复',
        '- 修复拖动标签排序后滚动位置错乱',
      ].join('\n'),
    },
  });

  // 把「立即更新」接管成假下载：点击后约 3 秒走完，然后停在安装完成态
  const originalInstall = useUpdateStore.getState().install;
  useUpdateStore.setState({
    install: async () => {
      useUpdateStore.setState({ status: 'downloading', progress: 0, downloaded: 0, total });
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 100));
        downloaded = Math.round((total * (i + 1)) / 30);
        useUpdateStore.setState({ progress: (i + 1) / 30, downloaded });
      }
      useUpdateStore.setState({ status: 'installing', progress: 1 });
      // 预览不重启，2 秒后恢复原 install，避免影响后续真实调用
      setTimeout(() => useUpdateStore.setState({ install: originalInstall }), 2000);
    },
  });
}
