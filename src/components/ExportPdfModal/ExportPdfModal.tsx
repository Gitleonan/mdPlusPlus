import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ExportFormat } from '../../features/export/export';

interface ExportModalProps {
  open: boolean;
  fileName: string | null;
  onConfirm: (format: ExportFormat) => Promise<void> | void;
  onClose: () => void;
}

const OPTIONS: Array<{ format: ExportFormat; title: string; hint: string }> = [
  { format: 'pdf', title: 'PDF', hint: '生成独立 PDF 文件' },
  { format: 'html', title: 'HTML', hint: '保留当前预览样式' },
  { format: 'markdown', title: 'Markdown', hint: '另存为新的 .md 文件' },
];

export function ExportPdfModal({ open, fileName, onConfirm, onClose }: ExportModalProps) {
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setFormat('pdf');
      return;
    }
    dialogRef.current?.querySelector<HTMLButtonElement>('[data-primary]')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm(format);
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="export-modal-overlay"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) onClose();
          }}
        >
          <motion.div
            className="export-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-modal-title"
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
          >
        <div className="export-modal-inner">
          <div className="export-modal-header">
            <span className="export-modal-badge">md++</span>
            <h3 id="export-modal-title">导出文件</h3>
          </div>
          {fileName && (
            <p className="export-modal-target">
              <span className="export-modal-target-label">当前文档</span>
              <span className="export-modal-target-name">{fileName}</span>
            </p>
          )}
          <div className="export-format-grid" role="radiogroup" aria-label="导出格式">
            {OPTIONS.map((option) => (
              <button
                key={option.format}
                type="button"
                className={`export-format-option ${format === option.format ? 'active' : ''}`}
                onClick={() => setFormat(option.format)}
                role="radio"
                aria-checked={format === option.format}
              >
                <span>{option.title}</span>
                <small>{option.hint}</small>
              </button>
            ))}
          </div>
          <div className="export-modal-actions">
            <button type="button" className="export-modal-btn" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button
              type="button"
              className="export-modal-btn primary"
              data-primary
              onClick={handleConfirm}
              disabled={busy}
            >
              {busy ? '导出中...' : '导出'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
    )}
  </AnimatePresence>
  );
}
