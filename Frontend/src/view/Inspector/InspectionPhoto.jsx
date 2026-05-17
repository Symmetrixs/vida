import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import { Upload, Scan, Trash2, ZoomIn, AlertTriangle, CheckCircle } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import CanvasModal from "../../components/CanvasModal.jsx";

const DEFECT_COLORS = { crack: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", faded_paint: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", spalling: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400", water_stain: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" };

export default function InspectionPhoto({ inspectionId: propId, embedded = false }) {
  const { id: paramId } = useParams();
  const inspId = propId || paramId;
  const [photos,    setPhotos]    = useState([]);
  const [uploading, setUploading] = useState(false);
  const [scanning,  setScanning]  = useState(null);
  const [canvas,    setCanvas]    = useState({ open: false, url: "", detections: [] });

  const fetchPhotos = () => api.get(`/photos/${inspId}/list`).then(r => setPhotos(r.data)).catch(() => {});
  useEffect(() => { if (inspId) fetchPhotos(); }, [inspId]);

  const onDrop = useCallback(async (files) => {
    setUploading(true);
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("inspection_id", inspId);
      try {
        await api.post("/photos/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      } catch { toast.error(`Failed to upload ${file.name}`); }
    }
    await fetchPhotos();
    toast.success(`${files.length} photo(s) uploaded`);
    setUploading(false);
  }, [inspId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { "image/*": [".jpg",".jpeg",".png",".webp"] }, multiple: true });

  const handleScan = async (photo) => {
    setScanning(photo.id);
    try {
      const blob = await fetch(photo.url).then(r => r.blob());
      const fd = new FormData();
      fd.append("file", blob, "photo.jpg");
      const r = await api.post("/ai/detect", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const detections = r.data.detections || [];

      if (detections.length > 0) {
        for (const det of detections) {
          await api.post("/findings/", {
            inspection_id: inspId,
            defect_type: det.label,
            severity: det.score >= 0.8 ? "high" : det.score >= 0.5 ? "medium" : "low",
            confidence: det.score,
            bbox: det.box,
            photo_id: photo.id,
          });
        }
        toast.success(`${detections.length} defect(s) detected`);
      } else {
        toast("No defects detected", { icon: "✅" });
      }
      setCanvas({ open: true, url: photo.url, detections });
    } catch { toast.error("AI scan failed"); }
    finally { setScanning(null); }
  };

  const handleDelete = async (id) => {
    await api.delete(`/photos/${id}`);
    toast.success("Photo deleted");
    fetchPhotos();
  };

  return (
    <div className={embedded ? "" : "max-w-3xl mx-auto space-y-6"}>
      {!embedded && <div className="page-header"><h1 className="page-title">Inspection Photos</h1><p className="page-subtitle">Upload images and run AI defect detection</p></div>}

      <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${isDragActive ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" : "border-slate-200 dark:border-slate-700 hover:border-primary-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
        <input {...getInputProps()}/>
        <Upload size={32} className={`mx-auto mb-3 ${isDragActive ? "text-primary-600" : "text-slate-300 dark:text-slate-600"}`}/>
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-primary-600">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
            Uploading…
          </div>
        ) : isDragActive ? (
          <p className="text-primary-600 font-medium text-sm">Drop photos here</p>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Drag & drop photos here, or <span className="text-primary-600">browse</span></p>
            <p className="text-xs text-slate-400 mt-1">JPEG, PNG, WebP · Max 10MB each</p>
          </>
        )}
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <AnimatePresence>
            {photos.map((photo, i) => (
              <motion.div key={photo.id} className="card overflow-hidden group" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: i * 0.04 }}>
                <div className="relative aspect-video bg-slate-100 dark:bg-slate-800">
                  <img src={photo.url} alt="inspection" className="w-full h-full object-cover"/>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button onClick={() => setCanvas({ open: true, url: photo.url, detections: [] })} className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow"><ZoomIn size={14}/></button>
                    <button onClick={() => handleDelete(photo.id)} className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow text-red-500"><Trash2 size={14}/></button>
                  </div>
                </div>
                <div className="p-3">
                  <motion.button
                    onClick={() => handleScan(photo)}
                    disabled={scanning === photo.id}
                    className="btn-primary w-full text-xs py-1.5"
                    whileTap={{ scale: 0.97 }}
                  >
                    {scanning === photo.id ? (
                      <span className="flex items-center gap-1.5 justify-center">
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                        Scanning…
                      </span>
                    ) : <span className="flex items-center gap-1.5 justify-center"><Scan size={13}/> AI Scan</span>}
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {photos.length === 0 && !uploading && (
        <p className="text-center text-sm text-slate-400 py-4">No photos yet — upload some above</p>
      )}

      <CanvasModal open={canvas.open} onClose={() => setCanvas(c => ({...c, open: false}))} imageUrl={canvas.url} detections={canvas.detections}/>
    </div>
  );
}
