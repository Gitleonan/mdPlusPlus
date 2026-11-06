import { AnimatePresence, motion } from 'framer-motion';
import { useToastStore } from '../../stores/toastStore';

/**
 * 全局提示宿主——顶部居中玻璃胶囊,自动消失。
 * role=status + aria-live 让屏幕阅读器主动播报(错误面人性化的一部分)。
 */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="toast-host" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`toast toast-${t.type}`}
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            onClick={() => useToastStore.getState().dismiss(t.id)}
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
