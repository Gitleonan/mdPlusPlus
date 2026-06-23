import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLightbox } from '../../hooks/useLightbox';

export function Lightbox() {
  const src = useLightbox((s) => s.src);
  const close = useLightbox((s) => s.close);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!src) return;
    setScale(1);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(s + 0.2, 4));
      if (e.key === '-') setScale((s) => Math.max(s - 0.2, 0.2));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [src, close]);

  return (
    <AnimatePresence>
      {src && (
        <motion.div
          className="lightbox-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={close}
        >
          <motion.img
            src={src}
            className="lightbox-img"
            style={{ transform: `scale(${scale})` }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            onClick={(e) => e.stopPropagation()}
            alt=""
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
