import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import { Upload, Scan, Trash2, Pencil, XCircle, Plus, X, ZoomIn } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import AnnotationModal from "../../components/AnnotationModal.jsx";
import { getAnnot, setAnnot } from "../../utils/annotCache.js";

const DEFECT_COLORS = {
  crack:         "#ef4444",
  faded_paint:   "#f59e0b",
  spalling:      "#8b5cf6",
  water_stain:   "#3b82f6",
  rust:          "#b45309",
  mold:          "#16a34a",
  efflorescence: "#64748b",
};

const ssKey  = (inspId, k) => `vida_${k}_${inspId}`;
const ssSave = (inspId, k, v) => { try { sessionStorage.setItem(ssKey(inspId, k), JSON.stringify(v)); } catch {} };
const ssLoad = (inspId, k, def) => { try { const s = sessionStorage.getItem(ssKey(inspId, k)); return s ? JSON.parse(s) : def; } catch { return def; } };



function PhotoLightbox({ photo, detections, onClose, onRemoveDet }) {
  if (!photo) return null;
  return (
    <motion.div className="fixed inset-0 z-50 flex flex-col bg-black/95" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-white font-semibold text-sm">{photo.label} — {detections.length} detection(s)</span>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><X size={16}/></button>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        <div className="relative inline-block">
          <img src={photo.url} alt={photo.label} className="max-w-full max-h-[70vh] rounded-xl object-contain"/>
          {detections.length > 0 && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${photo.w || 1000} ${photo.h || 750}`} preserveAspectRatio="none">
              {detections.map((d, i) => {
                const { xmin, ymin, xmax, ymax } = d.box;
                const color = DEFECT_COLORS[d.label] || "#6366f1";
                return (
                  <g key={i}>
                    <rect x={xmin} y={ymin} width={xmax-xmin} height={ymax-ymin} stroke={color} strokeWidth={3} fill={`${color}22`} rx={3}/>
                    <rect x={xmin} y={Math.max(0, ymin-24)} width={Math.min(xmax-xmin, 180)} height={24} fill={color} rx={3}/>
                    <text x={xmin+4} y={Math.max(0, ymin-7)} fontSize={13} fill="white" fontWeight="700">#{i+1} {d.label.replace("_"," ")} {Math.round(d.score*100)}%</text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
      {detections.length > 0 && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-xs text-white/60 mb-2">Tap × on a finding to remove it from this photo</p>
          <div className="flex flex-wrap gap-2">
            {detections.map((d, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl px-3 py-2 text-white min-w-[180px]" style={{ background: DEFECT_COLORS[d.label] || "#6366f1" }}>
                <span className="w-5 h-5 rounded-full bg-black/30 flex items-center justify-center text-[10px] font-bold shrink-0">#{i+1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm capitalize">{d.label.replace("_"," ")}</p>
                  <p className="text-xs opacity-80">{d.severity} · {Math.round(d.score*100)}% confidence</p>
                </div>
                <button onClick={() => onRemoveDet(i)} className="w-7 h-7 rounded-full bg-black/25 hover:bg-black/50 flex items-center justify-center transition-colors shrink-0"><X size={13}/></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function InspectionPhoto({ inspectionId: propId, embedded = false, onStateChange }) {
  const { id: paramId } = useParams();
  const inspId          = propId || paramId;

  const [photos,     setPhotos]     = useState([]);
  const [uploading,  setUploading]  = useState(false);
  const [scanning,   setScanning]   = useState(null);
  const [aiResults,  setAiResults]  = useState(() => ssLoad(inspId, "aiResults", {}));
  const [groups,     setGroups]     = useState(() => ssLoad(inspId, "groups", []));
  const [savedAnnot, setSavedAnnot] = useState(() => getAnnot(inspId));
  const [canvas,     setCanvas]     = useState({ open: false, groupIdx: null });
  const [dragPhoto,  setDragPhoto]  = useState(null);
  const [dragOver,   setDragOver]   = useState(null);
  const [dbGroupsLoaded, setDbGroupsLoaded] = useState(false);
  const [lightbox,   setLightbox]   = useState({ open: false, photo: null });

  useEffect(() => { ssSave(inspId, "aiResults", aiResults); }, [aiResults, inspId]);
  useEffect(() => { ssSave(inspId, "groups", groups); }, [groups, inspId]);
  useEffect(() => { setAnnot(inspId, savedAnnot); }, [savedAnnot, inspId]);
  useEffect(() => { onStateChange?.({ groups, aiResults, savedAnnot }); }, [groups, aiResults, savedAnnot]);

  const saveGroupsToDB = async (currentGroups, currentAnnot) => {
    if (!inspId || !currentGroups.length) return;
    try {
      await api.post(`/groups/${inspId}/save`, {
        groups: currentGroups.map((g, i) => ({
          id:         g.id?.startsWith("g-") ? undefined : g.id,
          label:      g.label,
          sort_order: i,
          photos:     g.photoIds.map((pid, j) => ({ photo_id: pid, sort_order: j })),
          annotation: currentAnnot[g.id] ? {
            actions:     currentAnnot[g.id].actions     || null,
            layout:      currentAnnot[g.id].layout      || null,
            canvas_data: currentAnnot[g.id].dataUrl     || null,
          } : null,
        })),
      });
    } catch {}
  };



  const fetchPhotos = () => api.get(`/photos/${inspId}/list`).then(r => setPhotos(r.data)).catch(() => {});

  useEffect(() => { if (inspId) fetchPhotos(); }, [inspId]);

  useEffect(() => {
    if (!inspId) return;
    api.get(`/groups/${inspId}`).then(r => {
      const dbGroups = r.data || [];
      if (dbGroups.length) {
        const restored = dbGroups.map(g => ({ id: g.id, label: g.label, photoIds: g.photoIds || [] }));
        setGroups(restored);
        const annotMap = {};
        dbGroups.forEach(g => {
          if (g.annotation?.canvas_data) {
            annotMap[g.id] = {
              dataUrl:  g.annotation.canvas_data,
              actions:  g.annotation.actions || [],
              layout:   g.annotation.layout  || null,
              savedAt:  new Date().toISOString(),
            };
          }
        });
        if (Object.keys(annotMap).length) setSavedAnnot(annotMap);
      }
      setDbGroupsLoaded(true);
    }).catch(() => { setDbGroupsLoaded(true); });
  }, [inspId]);

  useEffect(() => {
    if (!inspId || Object.keys(aiResults).length > 0) return;
    api.get(`/findings/?inspection_id=${inspId}`).then(r => {
      const findings = r.data || [];
      if (!findings.length) return;
      const reconstructed = {};
      findings.forEach(f => {
        if (!f.photo_id) return;
        if (!reconstructed[f.photo_id]) reconstructed[f.photo_id] = [];
        reconstructed[f.photo_id].push({
          label:    f.defect_type,
          score:    f.confidence || 0.1,
          severity: f.severity,
          box:      f.bbox || { xmin: 10, ymin: 10, xmax: 90, ymax: 90 },
        });
      });
      if (Object.keys(reconstructed).length) setAiResults(reconstructed);
    }).catch(() => {});
  }, [inspId]);



  useEffect(() => {
    if (!photos.length || !dbGroupsLoaded) return;
    setGroups(prev => {
      const usedIds = new Set(prev.flatMap(g => g.photoIds));
      const newIds  = photos.filter(p => !usedIds.has(p.id)).map(p => p.id);
      if (!newIds.length) return prev;
      const updated = [...prev, { id: `g-${Date.now()}`, label: String(prev.length + 1), photoIds: newIds }];
      setTimeout(() => saveGroupsToDB(updated, savedAnnot), 100);
      return updated;
    });
  }, [photos, dbGroupsLoaded]);

  const onDrop = useCallback(async (files) => {
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
  }, [inspId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp"] }, multiple: true,
  });

  const handleScan = async (photo) => {
    if (aiResults[photo.id]) {
      setAiResults(prev => { const n = {...prev}; delete n[photo.id]; return n; });
      toast("AI removed", { icon: "🗑" }); return;
    }
    setScanning(photo.id);
    try {
      const blob = await fetch(photo.url).then(r => r.blob());
      const fd   = new FormData(); fd.append("file", blob, "photo.jpg");
      const r    = await api.post("/ai/detect", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const dets = r.data.detections || [];
      if (dets.length > 0) {
        for (const det of dets) {
          await api.post("/findings/", {
            inspection_id: inspId,
            defect_type:   det.label,
            severity:      det.severity || (det.score >= 0.8 ? "high" : det.score >= 0.5 ? "medium" : "low"),
            confidence:    det.score,
            bbox:          det.box,
            photo_id:      photo.id,
          });
        }
        toast.success(`${dets.length} defect(s) detected`);
      } else { toast("No defects", { icon: "✅" }); }
      setAiResults(prev => ({ ...prev, [photo.id]: dets }));
    } catch (e) { toast.error("AI scan failed — " + (e?.response?.data?.detail || e.message)); }
    finally { setScanning(null); }
  };

  const handleDelete = async (photoId) => {
    await api.delete(`/photos/${photoId}`);
    setAiResults(prev => { const n = {...prev}; delete n[photoId]; return n; });
    setGroups(prev => {
      const updated = prev.map(g => ({ ...g, photoIds: g.photoIds.filter(id => id !== photoId) })).filter(g => g.photoIds.length > 0);
      saveGroupsToDB(updated, savedAnnot);
      return updated;
    });
    if (lightbox.photo?.id === photoId) setLightbox({ open: false, photo: null });
    fetchPhotos();
  };

  const removeDet = (photoId, idx) => {
    setAiResults(prev => {
      const dets = [...(prev[photoId] || [])];
      dets.splice(idx, 1);
      if (lightbox.photo?.id === photoId) setLightbox(l => ({ ...l }));
      return { ...prev, [photoId]: dets };
    });
  };

  const handleDragStart = (e, photoId, fromGroupId) => { setDragPhoto({ photoId, fromGroupId }); e.dataTransfer.effectAllowed = "move"; };
  const handleDragOver  = (e, toGroupId) => { e.preventDefault(); setDragOver(toGroupId); };
  const handleDrop = (e, toGroupId) => {
    e.preventDefault(); setDragOver(null);
    if (!dragPhoto || dragPhoto.fromGroupId === toGroupId) { setDragPhoto(null); return; }
    setGroups(prev => {
      const updated = prev.map(g => {
        if (g.id === dragPhoto.fromGroupId) return { ...g, photoIds: g.photoIds.filter(id => id !== dragPhoto.photoId) };
        if (g.id === toGroupId)             return { ...g, photoIds: [...g.photoIds, dragPhoto.photoId] };
        return g;
      }).filter(g => g.photoIds.length > 0);
      saveGroupsToDB(updated, savedAnnot);
      return updated;
    });
    setDragPhoto(null);
    toast("Photo moved", { icon: "↔️" });
  };

  const handleSaveAnnotation = (photoIds, dataUrl, actions, layout) => {
    const groupId = groups[canvas.groupIdx]?.id;
    if (!groupId) return;
    const newAnnot = { ...savedAnnot, [groupId]: { dataUrl, photoIds, actions, layout, savedAt: new Date().toISOString() } };
    setSavedAnnot(newAnnot);
    saveGroupsToDB(groups, newAnnot);
    toast.success("Annotation saved");
  };

  const getGroupPhotos = (group) =>
    group.photoIds.map((id, idx) => {
      const p = photos.find(ph => ph.id === id);
      return p ? { ...p, number: `${group.label}.${idx+1}`, label: `${group.label}.${idx+1}`, detections: aiResults[id] || [] } : null;
    }).filter(Boolean);

  const openLightbox = (photo) => {
    const dets = aiResults[photo.id] || [];
    setLightbox({ open: true, photo: { ...photo, w: 1000, h: 750 }, detections: dets });
  };

  return (
    <div className={embedded ? "" : "max-w-3xl mx-auto space-y-6"}>
      {!embedded && <div className="page-header"><h1 className="page-title">Inspection Photos</h1></div>}

      <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${isDragActive ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" : "border-slate-200 dark:border-slate-700 hover:border-primary-400"}`}>
        <input {...getInputProps()}/>
        <Upload size={32} className={`mx-auto mb-3 ${isDragActive ? "text-primary-600" : "text-slate-300 dark:text-slate-600"}`}/>
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-primary-600"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Uploading…</div>
        ) : isDragActive ? <p className="text-primary-600 font-medium text-sm">Drop photos here</p> : (
          <><p className="text-sm font-medium text-slate-600 dark:text-slate-400">Drag & drop photos, or <span className="text-primary-600">browse</span></p><p className="text-xs text-slate-400 mt-1">JPEG, PNG, WebP · Max 10MB · Drag photos between groups</p></>
        )}
      </div>

      {groups.length > 0 && (
        <div className="space-y-4">
          <AnimatePresence>
            {groups.map((group, gIdx) => {
              const gPhotos  = getGroupPhotos(group);
              const annot    = savedAnnot[group.id];
              const isTarget = dragOver === group.id;
              return (
                <motion.div key={group.id} className={`card overflow-hidden transition-all ${isTarget ? "ring-2 ring-primary-500 ring-offset-2" : ""}`}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                  onDragOver={e => handleDragOver(e, group.id)} onDragLeave={() => setDragOver(null)} onDrop={e => handleDrop(e, group.id)}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="w-8 h-8 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{group.label}</span>
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Group {group.label}</span>
                        <span className="text-xs text-slate-400 ml-2">
                          {gPhotos.length} photo{gPhotos.length !== 1 ? "s" : ""}
                          {gPhotos.some(p => (aiResults[p.id]||[]).length) && <span className="ml-1 text-amber-500">· {gPhotos.reduce((s,p) => s+(aiResults[p.id]||[]).length, 0)} defect(s)</span>}
                          {annot && <span className="ml-1 text-emerald-500">· annotated</span>}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => setCanvas({ open: true, groupIdx: gIdx })} disabled={gPhotos.length === 0} className="btn-primary px-3 py-1.5 text-xs gap-1.5 flex items-center disabled:opacity-40">
                        <Pencil size={12}/> {annot ? "Edit Annotation" : "Annotate"}
                      </button>
                      <button
                        onClick={() => {
                          if (gPhotos.length > 0 && !confirm(`Remove Group ${group.label}? Its ${gPhotos.length} photo(s) will move to Group 1.`)) return;
                          setGroups(prev => {
                            const remaining = prev.filter(g => g.id !== group.id);
                            if (gPhotos.length > 0 && remaining.length > 0) {
                              remaining[0] = { ...remaining[0], photoIds: [...remaining[0].photoIds, ...group.photoIds] };
                            }
                            const renumbered = remaining.map((g, i) => ({ ...g, label: String(i+1) }));
                            saveGroupsToDB(renumbered, savedAnnot);
                            return renumbered;
                          });
                        }}
                        className="w-7 h-7 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center transition-colors border border-red-200 dark:border-red-800"
                        title="Remove group"
                      >
                        <X size={13}/>
                      </button>
                    </div>
                  </div>

                  {annot && (
                    <div className="px-4 pt-3">
                      <div className="relative rounded-xl overflow-hidden border border-emerald-200 dark:border-emerald-800">
                        <img src={annot.dataUrl} alt="annotation" className="w-full object-contain max-h-48 bg-slate-950"/>
                        <div className="absolute top-2 right-2">
                          <button onClick={() => setSavedAnnot(prev => { const n={...prev}; delete n[group.id]; return n; })} className="w-6 h-6 bg-black/60 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors" title="Remove annotation"><X size={10}/></button>
                        </div>
                        <div className="absolute bottom-2 left-2"><span className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.5 rounded-full">Annotated · {new Date(annot.savedAt).toLocaleTimeString()}</span></div>
                      </div>
                    </div>
                  )}

                  <div className={`p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 ${isTarget ? "bg-primary-50/30 dark:bg-primary-900/10" : ""}`}>
                    {gPhotos.length === 0 ? (
                      <div className="col-span-3 text-center text-sm text-slate-400 py-4">{isTarget ? "Drop here" : "No photos — drag here or upload above"}</div>
                    ) : (
                      <AnimatePresence>
                        {gPhotos.map(photo => {
                          const dets    = aiResults[photo.id] || [];
                          const scanned = aiResults[photo.id] !== undefined;
                          return (
                            <motion.div key={photo.id} className="rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 cursor-grab active:cursor-grabbing"
                              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                              draggable onDragStart={e => handleDragStart(e, photo.id, group.id)} onDragEnd={() => { setDragPhoto(null); setDragOver(null); }}>
                              <div className="relative aspect-video bg-slate-100 dark:bg-slate-800 select-none">
                                <img src={photo.url} alt={photo.label} className="w-full h-full object-cover pointer-events-none"/>
                                {scanned && dets.length > 0 && (
                                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 750" preserveAspectRatio="none">
                                    {dets.map((d, i) => { const { xmin,ymin,xmax,ymax } = d.box; const color = DEFECT_COLORS[d.label]||"#6366f1"; return <rect key={i} x={xmin} y={ymin} width={xmax-xmin} height={ymax-ymin} stroke={color} strokeWidth={8} fill={`${color}22`} rx={4}/>; })}
                                  </svg>
                                )}
                                <div className="absolute top-1.5 left-1.5"><span className="text-[10px] font-bold bg-black/60 text-white px-1.5 py-0.5 rounded-full">{photo.label}</span></div>
                                <div className="absolute top-1.5 right-1.5 flex gap-1">
                                  <button onClick={() => openLightbox(photo)} className="w-7 h-7 rounded-full bg-black/60 hover:bg-primary-600 flex items-center justify-center text-white transition-colors" title="Enlarge"><ZoomIn size={12}/></button>
                                  <button onClick={() => handleDelete(photo.id)} className="w-7 h-7 rounded-full bg-black/60 hover:bg-red-600 flex items-center justify-center text-white transition-colors" title="Delete"><Trash2 size={12}/></button>
                                </div>
                              </div>

                              {scanned && dets.length > 0 && (
                                <div className="px-2 pt-2 pb-1 space-y-1">
                                  {dets.map((d, i) => (
                                    <div key={i} className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-white text-xs" style={{ background: DEFECT_COLORS[d.label]||"#6366f1" }}>
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="w-4 h-4 rounded-full bg-black/25 flex items-center justify-center text-[9px] font-bold shrink-0">#{i+1}</span>
                                        <span className="font-semibold capitalize truncate">{d.label.replace("_"," ")}</span>
                                        <span className="opacity-75 shrink-0">{Math.round(d.score*100)}%</span>
                                      </div>
                                      <button onClick={() => removeDet(photo.id, i)} className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center transition-colors shrink-0 ml-1"><X size={12}/></button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="p-2">
                                <motion.button onClick={() => handleScan(photo)} disabled={scanning === photo.id}
                                  className={`w-full text-[11px] py-2 rounded-lg font-semibold flex items-center gap-1 justify-center transition-colors ${scanned ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800" : "btn-primary"}`}
                                  whileTap={{ scale: 0.97 }}>
                                  {scanning === photo.id ? <span className="flex items-center gap-1"><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Scanning…</span>
                                    : scanned ? <span className="flex items-center gap-1"><XCircle size={12}/> Remove AI</span>
                                    : <span className="flex items-center gap-1"><Scan size={12}/> AI Scan</span>}
                                </motion.button>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <button onClick={() => setGroups(prev => { const updated = [...prev, { id: `g-${Date.now()}`, label: String(prev.length+1), photoIds: [] }]; saveGroupsToDB(updated, savedAnnot); return updated; })} className="btn-secondary w-full flex items-center justify-center gap-2 py-2.5 text-sm">
            <Plus size={15}/> Add New Group
          </button>
        </div>
      )}

      {photos.length === 0 && !uploading && <p className="text-center text-sm text-slate-400 py-4">No photos yet — upload above</p>}

      <AnnotationModal
        open={canvas.open}
        onClose={() => setCanvas(c => ({ ...c, open: false }))}
        photos={canvas.groupIdx !== null && groups[canvas.groupIdx] ? getGroupPhotos(groups[canvas.groupIdx]) : []}
        onSave={handleSaveAnnotation}
        initialActions={canvas.groupIdx !== null ? (savedAnnot[groups[canvas.groupIdx]?.id]?.actions || []) : []}
        initialPhotoLayout={canvas.groupIdx !== null ? (savedAnnot[groups[canvas.groupIdx]?.id]?.layout || null) : null}
      />

      <AnimatePresence>
        {lightbox.open && (
          <PhotoLightbox
            photo={lightbox.photo}
            detections={aiResults[lightbox.photo?.id] || []}
            onClose={() => setLightbox({ open: false, photo: null })}
            onRemoveDet={idx => removeDet(lightbox.photo?.id, idx)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}