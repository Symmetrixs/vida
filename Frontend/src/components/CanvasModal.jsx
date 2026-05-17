import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ZoomIn, ZoomOut, RotateCcw, Download } from "lucide-react";

const DEFECT_COLORS = {
  crack:       "#ef4444",
  faded_paint: "#f59e0b",
  spalling:    "#8b5cf6",
  water_stain: "#3b82f6",
};

export default function CanvasModal({ open, onClose, imageUrl, detections = [], onSave }) {
  const canvasRef = useRef(null);
  const [scale, setScale]     = useState(1);
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef(new Image());

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgLoaded) return;
    const ctx = canvas.getContext("2d");
    const img = imgRef.current;

    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    detections.forEach(({ label, score, box }) => {
      const color = DEFECT_COLORS[label] || "#6366f1";
      const { xmin, ymin, xmax, ymax } = box;
      const w = xmax - xmin;
      const h = ymax - ymin;

      ctx.strokeStyle = color;
      ctx.lineWidth   = 3;
      ctx.strokeRect(xmin, ymin, w, h);

      const text = `${label.replace("_", " ")} ${Math.round(score * 100)}%`;
      ctx.font = "bold 14px Inter, sans-serif";
      const tw = ctx.measureText(text).width + 10;
      const th = 22;

      ctx.fillStyle = color;
      ctx.fillRect(xmin, ymin - th, tw, th);
      ctx.fillStyle = "#fff";
      ctx.fillText(text, xmin + 5, ymin - 6);
    });
  }, [detections, imgLoaded]);

  useEffect(() => {
    if (!imageUrl) return;
    setImgLoaded(false);
    imgRef.current.crossOrigin = "anonymous";
    imgRef.current.src = imageUrl;
    imgRef.current.onload = () => {
      setImgLoaded(true);
    };
  }, [imageUrl]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "vida-annotated.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1,    opacity: 1 }}
            exit={{   scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white text-base">Detection Results</h2>
                <p className="text-xs text-slate-400 mt-0.5">{detections.length} defect(s) detected</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setScale((s) => Math.min(s + 0.25, 3))} className="btn-secondary px-2 py-1.5 text-xs gap-1"><ZoomIn size={14}/></button>
                <button onClick={() => setScale((s) => Math.max(s - 0.25, 0.25))} className="btn-secondary px-2 py-1.5 text-xs gap-1"><ZoomOut size={14}/></button>
                <button onClick={() => setScale(1)} className="btn-secondary px-2 py-1.5 text-xs gap-1"><RotateCcw size={14}/></button>
                <button onClick={handleDownload} className="btn-primary px-2.5 py-1.5 text-xs gap-1"><Download size={14}/> Save</button>
                <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X size={18}/></button>
              </div>
            </div>

            <div className="flex-1 overflow-auto scrollbar-thin p-4 flex items-start justify-center bg-slate-50 dark:bg-slate-950">
              <div style={{ transform: `scale(${scale})`, transformOrigin: "top center", transition: "transform 0.2s" }}>
                <canvas ref={canvasRef} className="rounded-lg shadow-lg max-w-full" />
              </div>
            </div>

            {detections.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
                {detections.map((d, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-white"
                    style={{ background: DEFECT_COLORS[d.label] || "#6366f1" }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                    {d.label.replace("_", " ")} — {Math.round(d.score * 100)}%
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
