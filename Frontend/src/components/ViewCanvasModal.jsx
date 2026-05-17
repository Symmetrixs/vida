import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, ZoomIn, ZoomOut } from "lucide-react";

const DEFECT_COLORS = {
  crack:       "#ef4444",
  faded_paint: "#f59e0b",
  spalling:    "#8b5cf6",
  water_stain: "#3b82f6",
};

export default function ViewCanvasModal({ open, onClose, imageUrl, findings = [] }) {
  const canvasRef = useRef(null);
  const [scale, setScale]  = useState(1);
  const [ready, setReady]  = useState(false);
  const imgRef = useRef(new Image());

  useEffect(() => {
    if (!imageUrl || !open) return;
    setReady(false);
    imgRef.current.crossOrigin = "anonymous";
    imgRef.current.src = imageUrl;
    imgRef.current.onload = () => setReady(true);
  }, [imageUrl, open]);

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = imgRef.current;
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    findings.forEach((f) => {
      const bbox  = f.bbox || {};
      const color = DEFECT_COLORS[f.defect_type] || "#6366f1";
      const { xmin = 0, ymin = 0, xmax = 100, ymax = 100 } = bbox;
      const w = xmax - xmin;
      const h = ymax - ymin;

      ctx.strokeStyle = color;
      ctx.lineWidth   = 3;
      ctx.strokeRect(xmin, ymin, w, h);

      const label = `${f.defect_type?.replace("_", " ")} (${f.severity})`;
      ctx.font = "bold 14px Inter, sans-serif";
      const tw = ctx.measureText(label).width + 10;

      ctx.fillStyle = color;
      ctx.fillRect(xmin, ymin - 22, tw, 22);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, xmin + 5, ymin - 6);
    });
  }, [ready, findings]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = "vida-report-annotated.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
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
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-semibold text-slate-900 dark:text-white">Annotated Image</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setScale((s) => Math.min(s + 0.25, 3))} className="btn-secondary px-2 py-1.5 text-xs"><ZoomIn size={14}/></button>
                <button onClick={() => setScale((s) => Math.max(s - 0.25, 0.25))} className="btn-secondary px-2 py-1.5 text-xs"><ZoomOut size={14}/></button>
                <button onClick={handleDownload} className="btn-primary px-3 py-1.5 text-xs gap-1"><Download size={14}/> Download</button>
                <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X size={18}/></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-start justify-center bg-slate-50 dark:bg-slate-950">
              <div style={{ transform: `scale(${scale})`, transformOrigin: "top center", transition: "transform 0.2s" }}>
                <canvas ref={canvasRef} className="rounded-lg shadow max-w-full" />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
