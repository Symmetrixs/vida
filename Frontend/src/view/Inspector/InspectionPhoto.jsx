import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import { Upload, Scan, Trash2, Pencil, ImageIcon, Layers, CheckCircle2 } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import AnnotationModal from "../../components/AnnotationModal.jsx";

const TILE_RING = [
  "border-amber-400 dark:border-amber-500",
  "border-pink-400 dark:border-pink-500",
  "border-emerald-400 dark:border-emerald-500",
  "border-cyan-400 dark:border-cyan-500",
  "border-violet-400 dark:border-violet-500",
];

const TILE_BADGE = [
  "bg-amber-500","bg-pink-500","bg-emerald-500","bg-cyan-500","bg-violet-500",
];

export default function InspectionPhoto({ inspectionId: propId, embedded = false }) {
  const { id: paramId } = useParams();
  const inspId = propId || paramId;

  const [photos,          setPhotos]          = useState([]);
  const [tiles,           setTiles]           = useState([]);
  const [uploading,       setUploading]       = useState(false);
  const [scanning,        setScanning]        = useState(null);
  const [annotated,       setAnnotated]       = useState({});
  const [photoFindings,   setPhotoFindings]   = useState({});
  const [annotating,      setAnnotating]      = useState(null);
  const [draggingPhotoId, setDraggingPhotoId] = useState(null);
  const [draggingFrom,    setDraggingFrom]    = useState(null);
  const [hoveredTile,     setHoveredTile]     = useState(null);

  const fetchPhotos = useCallback(async () => {
    try {
      const r = await api.get(`/photos/${inspId}/list`);
      const fetched = r.data || [];
      setPhotos(fetched);
      setTiles(prev => {
        const ids = new Set(fetched.map(p => p.id));
        const cleaned = prev.map(t => t.filter(id => ids.has(id))).filter(t => t.length > 0);
        const existing = new Set(cleaned.flat());
        const newOnes  = fetched.filter(p => !existing.has(p.id)).map(p => [p.id]);
        return [...cleaned, ...newOnes];
      });
    } catch (_) {}
  }, [inspId]);

  useEffect(() => { if (inspId) fetchPhotos(); }, [inspId, fetchPhotos]);

  const findPhoto = id => photos.find(p => p.id === id);

  const onDrop = useCallback(async (files) => {
    if (!files?.length) return;
    setUploading(true);
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("inspection_id", inspId);
      try { await api.post("/photos/upload", fd, { headers: { "Content-Type": "multipart/form-data" } }); }
      catch { toast.error(`Failed: ${file.name}`); }
    }
    await fetchPhotos();
    toast.success(`${files.length} photo(s) uploaded`);
    setUploading(false);
  }, [inspId, fetchPhotos]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp"] }, multiple: true,
  });

  const handleScan = async (photo) => {
    setScanning(photo.id);
    try {
      const blob = await fetch(photo.url).then(r => r.blob());
      const fd   = new FormData();
      fd.append("file", blob, "photo.jpg");
      const r    = await api.post("/ai/detect", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const detections = r.data?.detections || [];
      if (detections.length > 0) {
        for (const det of detections) {
          await api.post("/findings/", {
            inspection_id: inspId,
            defect_type:   det.label,
            severity:      det.score >= 0.8 ? "high" : det.score >= 0.5 ? "medium" : "low",
            confidence:    det.score,
            bbox:          det.box,
            photo_id:      photo.id,
          });
        }
        toast.success(`${detections.length} defect(s) detected`);
      } else { toast("No defects detected", { icon: "✅" }); }
      setPhotoFindings(prev => ({ ...prev, [photo.id]: detections }));
    } catch { toast.error("AI scan failed"); }
    finally { setScanning(null); }
  };

  const handleDelete = async (id) => {
    await api.delete(`/photos/${id}`);
    toast.success("Photo deleted");
    setPhotos(prev => prev.filter(p => p.id !== id));
    setTiles(prev => prev.map(t => t.filter(pid => pid !== id)).filter(t => t.length > 0));
    setAnnotated(prev => { const n = { ...prev }; delete n[id]; return n; });
    setPhotoFindings(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const handlePhotoDragStart = (e, photoId, fromTileIdx) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("pid", photoId);
    setDraggingPhotoId(photoId);
    setDraggingFrom(fromTileIdx);
  };

  const handlePhotoDragEnd = () => {
    setDraggingPhotoId(null);
    setDraggingFrom(null);
    setHoveredTile(null);
  };

  const handleTileDragOver = (e, idx) => {
    if (!draggingPhotoId) return;
    e.preventDefault();
    e.stopPropagation();
    if (idx !== draggingFrom) setHoveredTile(idx);
  };

  const handleTileDrop = (e, targetIdx) => {
    if (!draggingPhotoId) return;
    e.preventDefault();
    e.stopPropagation();
    const photoId = draggingPhotoId;
    const fromIdx = draggingFrom;
    if (fromIdx === targetIdx) { handlePhotoDragEnd(); return; }
    setTiles(prev => {
      const next = prev.map(t => [...t]);
      next[fromIdx]   = next[fromIdx].filter(id => id !== photoId);
      next[targetIdx] = [...next[targetIdx], photoId];
      return next.filter(t => t.length > 0);
    });
    toast.success("Photos grouped");
    handlePhotoDragEnd();
  };

  const handleEmptyDrop = (e) => {
    if (!draggingPhotoId) return;
    e.preventDefault();
    const photoId = draggingPhotoId;
    const fromIdx = draggingFrom;
    setTiles(prev => {
      const source = prev[fromIdx];
      if (!source || source.length <= 1) return prev;
      const next = prev.map(t => [...t]);
      next[fromIdx] = next[fromIdx].filter(id => id !== photoId);
      next.push([photoId]);
      toast.success("Ungrouped");
      return next.filter(t => t.length > 0);
    });
    handlePhotoDragEnd();
  };

  const openAnnotation = (tileIdx) => {
    const tile = tiles[tileIdx];
    if (!tile?.length) return;
    const tilePhotos = tile.map((id, pIdx) => {
      const p = findPhoto(id);
      if (!p) return null;
      return {
        ...p,
        number:     tileIdx + 1,
        photoIndex: pIdx + 1,
        label:      `${tileIdx + 1}.${pIdx + 1}`,
        detections: photoFindings[p.id] || [],
      };
    }).filter(Boolean);
    if (!tilePhotos.length) return;
    setAnnotating({
      mode: tilePhotos.length === 1 ? "single" : "group",
      tileIdx,
      photos: tilePhotos,
    });
  };

  const handleAnnotationSave = (ids, dataUrl) => {
    const idList = Array.isArray(ids) ? ids : [ids];
    setAnnotated(prev => {
      const next = { ...prev };
      idList.forEach(id => { next[id] = true; });
      return next;
    });
    toast.success("Annotations saved");
  };

  return (
    <div
      className={embedded ? "space-y-4" : "max-w-5xl mx-auto space-y-6"}
      onDragOver={e => { if (draggingPhotoId) { e.preventDefault(); setHoveredTile(null); } }}
      onDrop={handleEmptyDrop}
    >
      {!embedded && (
        <div className="page-header">
          <h1 className="page-title">Inspection Photos</h1>
          <p className="page-subtitle">Drag a photo onto another tile to group · drag outside to ungroup</p>
        </div>
      )}

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragActive
            ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 scale-[1.01]"
            : "border-slate-300 dark:border-slate-600 hover:border-primary-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
        }`}
      >
        <input {...getInputProps()} />
        <Upload size={32} className={`mx-auto mb-3 ${isDragActive ? "text-primary-500" : "text-slate-400 dark:text-slate-500"}`}/>
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-primary-600 dark:text-primary-400 text-sm font-medium">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>Uploading…
          </div>
        ) : isDragActive ? (
          <p className="text-primary-600 dark:text-primary-400 font-semibold text-sm">Drop photos here</p>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Drag & drop photos here, or <span className="text-primary-600 dark:text-primary-400 underline">browse</span>
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">JPEG, PNG, WebP · Max 10MB each</p>
          </>
        )}
      </div>

      {tiles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {tiles.length} Tile{tiles.length !== 1 ? "s" : ""} · {photos.length} Photo{photos.length !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-slate-400">Drop on tile to group · drop outside to ungroup</p>
          </div>

          <div className="space-y-4">
            <AnimatePresence>
              {tiles.map((tile, tileIdx) => {
                const isGroup   = tile.length > 1;
                const isHovered = hoveredTile === tileIdx;
                const ringClass = isGroup ? `border-2 ${TILE_RING[tileIdx % TILE_RING.length]}` : "border border-slate-200 dark:border-slate-700";

                return (
                  <motion.div
                    key={tile.join("-")}
                    layout
                    className={`rounded-2xl p-4 bg-white dark:bg-slate-900 transition-all duration-150 ${ringClass} ${
                      isHovered ? "ring-4 ring-amber-400 ring-offset-2 dark:ring-offset-slate-950 scale-[1.005]" : ""
                    }`}
                    onDragOver={e  => handleTileDragOver(e, tileIdx)}
                    onDrop={e      => handleTileDrop(e, tileIdx)}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: tileIdx * 0.03 }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`min-w-[40px] h-7 px-2.5 rounded-full text-xs font-bold flex items-center justify-center gap-1 text-white ${
                          isGroup ? TILE_BADGE[tileIdx % TILE_BADGE.length] : "bg-primary-600"
                        }`}>
                          {isGroup && <Layers size={10}/>}{tileIdx + 1}.0
                        </span>
                        {isGroup && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            Group · {tile.length} photos
                          </span>
                        )}
                      </div>
                      <motion.button
                        onClick={() => openAnnotation(tileIdx)}
                        className="btn-primary text-xs px-3 py-1.5 gap-1.5"
                        whileTap={{ scale: 0.97 }}
                      >
                        <Pencil size={12}/> Annotate
                      </motion.button>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {tile.map((photoId, pIdx) => {
                        const photo       = findPhoto(photoId);
                        if (!photo) return null;
                        const isAnnotated = !!annotated[photo.id];
                        const isScanned   = !!photoFindings[photo.id];
                        const isDragging  = draggingPhotoId === photo.id;
                        const label       = `${tileIdx + 1}.${pIdx + 1}`;

                        return (
                          <div
                            key={photo.id}
                            draggable
                            onDragStart={e => handlePhotoDragStart(e, photo.id, tileIdx)}
                            onDragEnd={handlePhotoDragEnd}
                            className={`group relative rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 cursor-grab active:cursor-grabbing flex-shrink-0 transition-all ${
                              isDragging ? "opacity-40 scale-95" : ""
                            }`}
                            style={{ width: 200, height: 140 }}
                          >
                            <img
                              src={photo.url}
                              alt={label}
                              draggable={false}
                              className="w-full h-full object-cover"
                            />

                            <div className="absolute top-2 left-2 flex items-center gap-1">
                              <span className="px-2 py-0.5 rounded-full bg-black/70 text-white text-[11px] font-bold tracking-wide">
                                {label}
                              </span>
                            </div>

                            <div className="absolute top-2 right-2 flex flex-col gap-1">
                              {isAnnotated && (
                                <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shadow" title="Annotated">
                                  <CheckCircle2 size={11} className="text-white"/>
                                </span>
                              )}
                              {isScanned && (
                                <span className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center shadow" title="AI scanned">
                                  <Scan size={10} className="text-white"/>
                                </span>
                              )}
                            </div>

                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2.5 gap-1.5">
                              <div className="grid grid-cols-2 gap-1.5">
                                <motion.button
                                  onClick={e => { e.stopPropagation(); handleScan(photo); }}
                                  disabled={!!scanning}
                                  className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-xs py-1.5 rounded-lg flex items-center justify-center gap-1 font-medium"
                                  whileTap={{ scale: 0.95 }}
                                >
                                  {scanning === photo.id ? (
                                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                                    </svg>
                                  ) : (
                                    <><Scan size={11}/> Scan</>
                                  )}
                                </motion.button>
                                <motion.button
                                  onClick={e => { e.stopPropagation(); handleDelete(photo.id); }}
                                  className="bg-red-500 hover:bg-red-600 text-white text-xs py-1.5 rounded-lg flex items-center justify-center gap-1 font-medium"
                                  whileTap={{ scale: 0.95 }}
                                >
                                  <Trash2 size={11}/> Remove
                                </motion.button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}

      {tiles.length === 0 && !uploading && (
        <div className="flex flex-col items-center justify-center gap-2 py-8">
          <ImageIcon size={32} className="text-slate-300 dark:text-slate-700"/>
          <p className="text-sm text-slate-400 dark:text-slate-500">No photos yet — upload some above</p>
        </div>
      )}

      {annotating && (
        <AnnotationModal
          open={true}
          onClose={() => setAnnotating(null)}
          photos={annotating.photos}
          onSave={handleAnnotationSave}
        />
      )}
    </div>
  );
}