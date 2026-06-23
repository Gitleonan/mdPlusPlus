import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { openExternalUrl, registerFileAssociation, checkFileAssociation } from '../../ipc/opener';
import { writeFile, getAppDataDir } from '../../ipc/files';
import { useTabsStore } from '../../stores/tabsStore';
import appIcon from '../../assets/app-icon.svg';
import featuresMd from '../../../features.md?raw';

const APP_VERSION = '0.1.0';
const GITHUB_URL = 'https://github.com/Gitleonan/easy-md';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export function AboutModal({ open, onClose }: AboutModalProps) {
  const [debug, setDebug] = useState(() => localStorage.getItem('mdpp.debug') === 'true');
  const [openingFeatures, setOpeningFeatures] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);
  const [setDefaultMsg, setSetDefaultMsg] = useState<string | null>(null);
  const [isDefaultHandler, setIsDefaultHandler] = useState(true); // 默认 true 避免闪烁
  const [checkingDefault, setCheckingDefault] = useState(false);

  // 每次打开关于窗口时检测是否为默认 MD 阅读器
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCheckingDefault(true);
    checkFileAssociation()
      .then((isDefault) => { if (!cancelled) setIsDefaultHandler(isDefault); })
      .catch(() => { if (!cancelled) setIsDefaultHandler(false); })
      .finally(() => { if (!cancelled) setCheckingDefault(false); });
    return () => { cancelled = true; };
  }, [open]);

  const openFeatures = useCallback(async () => {
    if (openingFeatures) return;
    setOpeningFeatures(true);
    try {
      const dir = await getAppDataDir();
      const featuresPath = `${dir}/features.md`;
      await writeFile(featuresPath, featuresMd);
      await useTabsStore.getState().openTab(featuresPath);
    } catch (err) {
      console.error('[AboutModal] openFeatures failed:', err);
    } finally {
      setOpeningFeatures(false);
    }
  }, [openingFeatures]);

  const handleSetDefault = useCallback(async () => {
    if (settingDefault) return;
    setSettingDefault(true);
    setSetDefaultMsg(null);
    try {
      await registerFileAssociation();
      setIsDefaultHandler(true);
      setSetDefaultMsg('已设为默认 MD 阅读器');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[AboutModal] registerFileAssociation failed:', err);
      setSetDefaultMsg(`设置失败: ${msg}`);
    } finally {
      setSettingDefault(false);
    }
  }, [settingDefault]);

  if (!open) return;

  const toggleDebug = () => {
    const next = !debug;
    setDebug(next);
    // 调用 main.tsx 暴露的全局函数
    (window as unknown as Record<string, (on: boolean) => void>).__toggleDebug?.(next);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="about-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            className="about-modal"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
        <div className="about-modal-inner">
          <img className="about-icon" src={appIcon} alt="" aria-hidden="true" />
          <h3 className="about-title">md++</h3>
          <p className="about-version">v{APP_VERSION}</p>
          <p className="about-desc">轻量便捷的 Markdown 阅读器</p>

          <div className="about-info">
            <div className="about-row">
              <span className="about-label">作者</span>
              <span className="about-value">leonan</span>
            </div>
            <div className="about-row">
              <span className="about-label">协议</span>
              <span className="about-value">MIT License</span>
            </div>
            <div className="about-row">
              <span className="about-label">仓库</span>
              <button
                className="about-link"
                onClick={() => openExternalUrl(GITHUB_URL)}
              >
                GitHub ↗
              </button>
            </div>
            <div className="about-row">
              <span className="about-label">特性</span>
              <button
                className="about-link"
                onClick={openFeatures}
                disabled={openingFeatures}
              >
                {openingFeatures ? '加载中…' : '查看支持特性'}
              </button>
            </div>
            <div className="about-row">
              <span className="about-label">默认打开</span>
              {checkingDefault ? (
                <span className="about-value">检测中…</span>
              ) : isDefaultHandler ? (
                <span className="about-value" style={{ color: '#4caf50' }}>已设为默认 Markdown 阅读器</span>
              ) : (
                <>
                  <button
                    className="about-link"
                    onClick={handleSetDefault}
                    disabled={settingDefault}
                  >
                    {settingDefault ? '设置中…' : '设为 MD 默认阅读器'}
                  </button>
                  {setDefaultMsg && (
                    <span className={`about-msg ${setDefaultMsg.startsWith('已') ? 'success' : 'error'}`}>
                      {setDefaultMsg}
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="about-row">
              <span className="about-label">调试模式</span>
              <button
                className={`about-debug-toggle ${debug ? 'active' : ''}`}
                onClick={toggleDebug}
                title={debug ? '关闭后禁止右键菜单' : '开启后可右键审查元素'}
              >
                {debug ? '已开启' : '已关闭'}
              </button>
            </div>
          </div>

          <button className="about-close" onClick={onClose}>
            关闭
          </button>
        </div>
      </motion.div>
    </motion.div>
    )}
  </AnimatePresence>
  );
}
