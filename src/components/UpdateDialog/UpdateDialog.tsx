import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowUpCircle, Check, Download, Loader2, RefreshCw, X } from 'lucide-react';
import { useUpdateStore, type UpdateStatus } from '../../stores/updateStore';

/** 与项目中其余弹窗一致的缓动 */
const EASE = [0.32, 0.72, 0, 1] as const;

/** 把 release notes 的 Markdown 粗处理成可显示的块（只认标题、列表、段落） */
function parseNotes(body: string | null): Array<{ kind: 'heading' | 'bullet' | 'text'; value: string }> {
  if (!body) return [];
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^[-=]{3,}$/.test(line))
    .map((line) => {
      const heading = line.match(/^#{1,6}\s+(.*)$/);
      if (heading) return { kind: 'heading' as const, value: heading[1] };
      const bullet = line.match(/^[-*+]\s+(.*)$/);
      if (bullet) return { kind: 'bullet' as const, value: bullet[1].replace(/^\[[ xX]\]\s*/, '') };
      return { kind: 'text' as const, value: line.replace(/\*\*/g, '') };
    })
    .slice(0, 80);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** 阶段切换容器：淡出下移 → 淡入上浮，高度由 layout 自动补间 */
function Stage({ stageKey, children }: { stageKey: UpdateStatus; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={stageKey}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, filter: 'blur(3px)' }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, filter: 'blur(3px)' }}
        transition={{ duration: 0.24, ease: EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function UpdateDialog() {
  const status = useUpdateStore((s) => s.status);
  const info = useUpdateStore((s) => s.info);
  const progress = useUpdateStore((s) => s.progress);
  const downloaded = useUpdateStore((s) => s.downloaded);
  const total = useUpdateStore((s) => s.total);
  const error = useUpdateStore((s) => s.error);
  const open = useUpdateStore((s) => s.dialogOpen);
  const install = useUpdateStore((s) => s.install);
  const closeDialog = useUpdateStore((s) => s.closeDialog);

  const reduce = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const locked = status === 'downloading' || status === 'installing';
  const notes = useMemo(() => parseNotes(info?.body ?? null), [info?.body]);
  // 手动检查会先 reset 成 idle 再发起请求；把 idle 归到 checking，避免弹窗闪一帧空白
  const stageStatus: UpdateStatus = status === 'idle' ? 'checking' : status;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) {
        e.preventDefault();
        closeDialog();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, locked, closeDialog]);

  const percent = progress === null ? null : Math.round(progress * 100);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="update-overlay"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !locked) closeDialog();
          }}
        >
          {/* layout 让卡片高度随阶段变化补间，避免内容切换时跳动 */}
          <motion.div
            className="update-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-modal-title"
            ref={cardRef}
            layout
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 18 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.3, ease: EASE, layout: { duration: 0.28, ease: EASE } }}
          >
            <div className="update-modal-inner">
              {!locked && (
                <button className="update-close" onClick={closeDialog} aria-label="关闭">
                  <X size={14} strokeWidth={1.6} />
                </button>
              )}

              <Stage stageKey={stageStatus}>
                {stageStatus === 'available' && info && (
                  <div className="update-stage">
                    <motion.div
                      className="update-badge"
                      initial={reduce ? false : { scale: 0.7, rotate: -8 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                    >
                      <ArrowUpCircle size={22} strokeWidth={1.7} />
                    </motion.div>
                    <h3 className="update-title" id="update-modal-title">
                      发现新版本
                    </h3>
                    <p className="update-version-line">
                      <span className="update-version-old">v{info.currentVersion}</span>
                      <motion.span
                        className="update-version-arrow"
                        initial={reduce ? false : { x: -4, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.1, duration: 0.25, ease: EASE }}
                      >
                        →
                      </motion.span>
                      <span className="update-version-new">v{info.version}</span>
                    </p>

                    {notes.length > 0 && (
                      <div className="update-notes">
                        {notes.map((n, i) => (
                          <motion.p
                            key={`${n.kind}-${i}`}
                            className={`update-note update-note-${n.kind}`}
                            initial={reduce ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.08 + Math.min(i, 10) * 0.025, duration: 0.22, ease: EASE }}
                          >
                            {n.value}
                          </motion.p>
                        ))}
                      </div>
                    )}

                    <div className="update-actions">
                      <button className="update-btn" onClick={closeDialog}>
                        稍后
                      </button>
                      <motion.button
                        className="update-btn primary"
                        onClick={install}
                        whileHover={reduce ? undefined : { scale: 1.02 }}
                        whileTap={reduce ? undefined : { scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        data-autofocus
                      >
                        <Download size={13} strokeWidth={1.8} />
                        立即更新
                      </motion.button>
                    </div>
                  </div>
                )}

                {status === 'downloading' && (
                  <div className="update-stage">
                    <div className="update-badge downloading">
                      <Loader2 size={22} strokeWidth={1.7} className="update-spin" />
                    </div>
                    <h3 className="update-title" id="update-modal-title">
                      正在下载更新
                    </h3>
                    <p className="update-sub">
                      {formatBytes(downloaded)}
                      {total ? ` / ${formatBytes(total)}` : ''}
                      {percent !== null ? `　${percent}%` : ''}
                    </p>

                    <div className="update-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}>
                      {percent === null ? (
                        <motion.div
                          className="update-progress-indeterminate"
                          animate={reduce ? undefined : { x: ['-40%', '140%'] }}
                          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      ) : (
                        <motion.div
                          className="update-progress-fill"
                          initial={false}
                          animate={{ width: `${percent}%` }}
                          transition={{ type: 'spring', stiffness: 120, damping: 26, restDelta: 0.5 }}
                        />
                      )}
                    </div>
                    <p className="update-hint">下载完成后会自动重启应用以完成安装。</p>
                  </div>
                )}

                {status === 'installing' && (
                  <div className="update-stage">
                    <div className="update-badge done">
                      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
                        <motion.circle
                          cx="13" cy="13" r="11"
                          stroke="currentColor" strokeWidth="1.6"
                          initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                          animate={{ pathLength: 1, opacity: 1 }}
                          transition={{ duration: 0.45, ease: EASE }}
                        />
                        <motion.path
                          d="M8 13.4l3.4 3.4L18 10.2"
                          stroke="currentColor" strokeWidth="1.9"
                          strokeLinecap="round" strokeLinejoin="round"
                          initial={reduce ? false : { pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ delay: 0.28, duration: 0.3, ease: EASE }}
                        />
                      </svg>
                    </div>
                    <h3 className="update-title" id="update-modal-title">
                      安装完成
                    </h3>
                    <p className="update-sub">应用即将重启以使用新版本…</p>
                  </div>
                )}

                {status === 'up-to-date' && (
                  <div className="update-stage">
                    <div className="update-badge done">
                      <Check size={22} strokeWidth={1.8} />
                    </div>
                    <h3 className="update-title" id="update-modal-title">
                      已是最新版本
                    </h3>
                    <p className="update-sub">当前版本 v{info?.currentVersion ?? '—'}，暂无可用更新。</p>
                    <div className="update-actions">
                      <button className="update-btn primary" onClick={closeDialog} data-autofocus>
                        知道了
                      </button>
                    </div>
                  </div>
                )}

                {status === 'error' && (
                  <div className="update-stage">
                    <div className="update-badge error">
                      <X size={22} strokeWidth={1.8} />
                    </div>
                    <h3 className="update-title" id="update-modal-title">
                      更新失败
                    </h3>
                    <p className="update-sub update-error-text">{error ?? '发生未知错误。'}</p>
                    <div className="update-actions">
                      <button className="update-btn" onClick={closeDialog}>
                        关闭
                      </button>
                      <button
                        className="update-btn primary"
                        onClick={() => {
                          const store = useUpdateStore.getState();
                          store.reset();
                          void store.check();
                        }}
                        data-autofocus
                      >
                        <RefreshCw size={13} strokeWidth={1.8} />
                        重试
                      </button>
                    </div>
                  </div>
                )}

                {status === 'checking' && (
                  <div className="update-stage">
                    <div className="update-badge downloading">
                      <Loader2 size={22} strokeWidth={1.7} className="update-spin" />
                    </div>
                    <h3 className="update-title" id="update-modal-title">
                      正在检查更新…
                    </h3>
                  </div>
                )}
              </Stage>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
