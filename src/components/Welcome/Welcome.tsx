import { openViaDialog } from '../../hooks/useOpenFile';
import { useRecentStore } from '../../stores/recentStore';
import { useTabsStore } from '../../stores/tabsStore';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { modKey } from '../../utils/platform';
import appIcon from '../../assets/app-icon.svg';

export function formatRecentOpenedAt(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const today = new Date(now);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();

  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (isSameDay(date, today)) return `今天 ${time}`;
  if (isSameDay(date, yesterday)) return `昨天 ${time}`;

  return date.toLocaleDateString('zh-CN', {
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    month: 'numeric',
    day: 'numeric',
  }) + ` ${time}`;
}

export function Welcome() {
  const { files, load } = useRecentStore();
  const openTab = useTabsStore((s) => s.openTab);

  useEffect(() => { load(); }, [load]);

  const item = {
    hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
    visible: { opacity: 1, y: 0, filter: 'blur(0px)' },
  };

  return (
    <div className="welcome">
      <motion.div
        className="welcome-inner"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.08 } },
        }}
      >
        <motion.img className="welcome-icon" variants={item} src={appIcon} alt="" aria-hidden="true" />
        <motion.h1 className="welcome-title" variants={item}>md++</motion.h1>
        <motion.p className="welcome-subtitle" variants={item}>轻量便捷的 Markdown 阅读器</motion.p>
        <motion.div variants={item}>
          <button className="welcome-open-btn" onClick={openViaDialog}>
            打开 Markdown 文件
          </button>
        </motion.div>
        <motion.p className="welcome-hint" variants={item}>或将 .md 文件拖入窗口</motion.p>
        <motion.p className="welcome-shortcut" variants={item}>{modKey()}+O 打开文件</motion.p>

        {files.length > 0 && (
          <motion.div className="welcome-recent" variants={item}>
            <div className="welcome-recent-header">
              <h3>最近打开</h3>
              <span>启动时快速回到上次阅读</span>
            </div>
            <ul>
              {files.slice(0, 10).map((f) => (
                <li key={f.path}>
                  <button className="welcome-recent-item" onClick={() => openTab(f.path)}>
                    <span className="welcome-recent-main">
                      <span className="welcome-recent-name">{f.name}</span>
                      <span className="welcome-recent-time">{formatRecentOpenedAt(f.lastOpenedAt)}</span>
                    </span>
                    <span className="welcome-recent-path" title={f.path}>{f.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
