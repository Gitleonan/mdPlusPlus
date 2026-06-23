import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCustomThemeStore, BUILTIN_THEMES } from '../../stores/customThemeStore';
import templateCss from '../../themes/template.css?raw';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { writeFile } from '../../ipc/files';

interface ThemeManagerProps {
  open: boolean;
  onClose: () => void;
}

export function ThemeManager({ open, onClose }: ThemeManagerProps) {
  const {
    themes,
    activeTheme,
    activeBuiltin,
    loadThemes,
    importTheme,
    setActive,
    setActiveBuiltin,
    removeTheme,
  } = useCustomThemeStore();

  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) loadThemes();
  }, [open, loadThemes]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const css = await file.text();
      const name = file.name.endsWith('.css') ? file.name : `${file.name}.css`;
      await importTheme(name, css);
    } catch (err) {
      console.error('[ThemeManager] import failed:', err);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`确定删除主题「${name}」？`)) return;
    try {
      await removeTheme(name);
    } catch (err) {
      console.error('[ThemeManager] delete failed:', err);
    }
  };

  const handleExportTemplate = async () => {
    try {
      const path = await saveDialog({
        defaultPath: 'mdpp-theme-template.css',
        filters: [{ name: 'CSS', extensions: ['css'] }],
      });
      if (!path) return;
      await writeFile(path, templateCss);
    } catch (err) {
      console.error('[ThemeManager] export template failed:', err);
    }
  };

  const noThemeActive = !activeTheme && !activeBuiltin;

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
            className="theme-modal"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
        <div className="theme-modal-inner">
          <h3 className="theme-modal-title">自定义主题</h3>
          <p className="theme-modal-desc">
            选择内置主题或导入 CSS 文件，样式作用于 Markdown 正文区域。
          </p>

          {/* 内置主题 */}
          <div className="theme-list">
            {BUILTIN_THEMES.map((t) => (
              <div key={t.id} className="theme-item">
                <span className="theme-item-name">{t.nameZh}</span>
                <div className="theme-item-actions">
                  {activeBuiltin === t.id ? (
                    <span className="theme-item-active">使用中</span>
                  ) : (
                    <button
                      className="theme-item-btn"
                      onClick={() => setActiveBuiltin(t.id)}
                    >
                      应用
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 用户主题 */}
          {themes.length > 0 && (
            <>
              <p className="theme-modal-desc" style={{ marginTop: 8, marginBottom: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                自定义导入
              </p>
              <div className="theme-list">
                {themes.map((name) => (
                  <div key={name} className="theme-item">
                    <span className="theme-item-name">{name}</span>
                    <div className="theme-item-actions">
                      {activeTheme === name ? (
                        <span className="theme-item-active">使用中</span>
                      ) : (
                        <button
                          className="theme-item-btn"
                          onClick={() => setActive(name)}
                        >
                          应用
                        </button>
                      )}
                      <button
                        className="theme-item-btn theme-item-btn-danger"
                        onClick={() => handleDelete(name)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!noThemeActive && (
            <button className="theme-reset-btn" onClick={() => { setActive(null); setActiveBuiltin('fresh'); }}>
              恢复默认主题
            </button>
          )}

          <div className="theme-modal-footer">
            <input
              ref={fileInputRef}
              type="file"
              accept=".css"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button
              className="theme-reset-btn"
              onClick={handleExportTemplate}
              title="导出 CSS 模板文件，修改后可重新导入"
            >
              导出模板
            </button>
            <button
              className="theme-import-btn"
              onClick={handleImportClick}
              disabled={importing}
            >
              {importing ? '导入中…' : '导入 CSS 文件'}
            </button>
            <button className="about-close" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
    )}
  </AnimatePresence>
  );
}
