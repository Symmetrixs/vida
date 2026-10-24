import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import { Upload, Trash2, Pencil, Plus, X, ZoomIn, AlertTriangle } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { apiErrorText } from "../../utils/apiError.js";
import AnnotationModal from "../../components/AnnotationModal.jsx";
import { getAnnot, setAnnot } from "../../utils/annotCache.js";
import { findingsByPhoto, isAiFinding } from "../../utils/findings.js";
import { useInspectionFindings, usePhotoScanner } from "../../utils/usePhotoScan.js";
import { FindingList, PhotoWithBoxes, ScanAllButton, ScanButton, ScanStatus } from "../../components/PhotoScan.jsx";

const ssKey  = (inspId, k) => `vida_${k}_${inspId}`;
const ssSave = (inspId, k, v) => { try { sessionStorage.setItem(ssKey(inspId, k), JSON.stringify(v)); } catch {} };
const ssLoad = (inspId, k, def) => { try { const s = sessionStorage.getItem(ssKey(inspId, k)); return s ? JSON.parse(s) : def; } catch { return def; } };

const NO_FINDINGS = [];

function PhotoLightbox({ photo, findings, editable, onClose, onChanged, onRemoved }) {
  if (!photo) return null;
  return (
    <motion.div className="fixed inset-0 z-50 flex flex-col bg-black/95" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-white font-semibold text-sm">Photo {photo.label}, {findings.length} finding(s)</span>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><X size={16}/></button>
      </div>
      <div className="flex-1 overflow-auto flex flex-col lg:flex-row gap-4 p-4">
        <div className="flex-1 flex items-center justify-center min-h-[40vh]">
          <PhotoWithBoxes photo={photo} findings={findings} fit="contain" className="w-full h-[70vh]"/>
        </div>
        <div className="lg:w-80 shrink-0 bg-white dark:bg-slate-900 rounded-xl p-3 space-y-2 self-start w-full">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Findings</p>
          <FindingList findings={findings} editable={editable} onChanged={onChanged} onRemoved={onRemoved} emptyText={photo.scanned_at ? "Scanned, no defects found" : "Not scanned yet"}/>
        </div>
      </div>
    </motion.div>
  );
}

export default function InspectionPhoto({ inspectionId: propId, embedded = false, onStateChange, readOnly = false }) {
  const { id: paramId } = useParams();
  const inspId          = propId || paramId;

  const [photos,     setPhotos]     = useState([]);
  const [uploading,  setUploading]  = useState(false);
  const [groups,     setGroups]     = useState(() => ssLoad(inspId, "groups", []));
  const [savedAnnot, setSavedAnnot] = useState(() => getAnnot(inspId));
  const [canvas,     setCanvas]     = useState({ open: false, groupIdx: null });
  const [dragPhoto,  setDragPhoto]  = useState(null);
  const [dragOver,   setDragOver]   = useState(null);
  const [dbGroupsLoaded, setDbGroupsLoaded] = useState(false);
  const [lightboxId, setLightboxId] = useState(null);

  const { findings, replaceForPhoto, updateOne, removeOne } = useInspectionFindings(inspId);
  const byPhoto = useMemo(() => findingsByPhoto(findings), [findings]);
  const findingsOf = useCallback((photoId) => byPhoto[photoId] || NO_FINDINGS, [byPhoto]);

  const onScanned = useCallback((photoId, result) => {
    replaceForPhoto(photoId, result.findings || []);
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, scanned_at: result.scanned_at } : p));
  }, [replaceForPhoto]);
  const scanner = usePhotoScanner({ onScanned });

  const latest = useRef({ savedAnnot });
  useEffect(() => { latest.current = { savedAnnot }; });

  useEffect(() => { ssSave(inspId, "groups", groups); }, [groups, inspId]);
  useEffect(() => { setAnnot(inspId, savedAnnot); }, [savedAnnot, inspId]);

  const unscanned = useMemo(() => photos.filter(p => !p.scanned_at), [photos]);
  useEffect(() => {
    onStateChange?.({ groups, savedAnnot, unscannedIds: unscanned.map(p => p.id), photoCount: photos.length });
  }, [groups, savedAnnot, unscanned, photos.length, onStateChange]);

  const saveGroupsToDB = useCallback(async (currentGroups, currentAnnot) => {
    if (!inspId || !currentGroups.length || readOnly) return;
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
  }, [inspId, readOnly]);

  const fetchPhotos = useCallback(() => api.get(`/photos/${inspId}/list`).then(r => setPhotos(r.data)).catch(() => {}), [inspId]);

  useEffect(() => { if (inspId) fetchPhotos(); }, [inspId, fetchPhotos]);

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
    if (!photos.length || !dbGroupsLoaded || readOnly) return;
    setGroups(prev => {
      const usedIds = new Set(prev.flatMap(g => g.photoIds));
      const newIds  = photos.filter(p => !usedIds.has(p.id)).map(p => p.id);
      if (!newIds.length) return prev;
      const updated = [...prev, { id: `g-${Date.now()}`, label: String(prev.length + 1), photoIds: newIds }];
      setTimeout(() => saveGroupsToDB(updated, latest.current.savedAnnot), 100);
      return updated;
    });
  }, [photos, dbGroupsLoaded, saveGroupsToDB, readOnly]);

  const onDrop = useCallback(async (files) => {
    setUploading(true);
    let ok = 0;
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("inspection_id", inspId);
      try { await api.post("/photos/upload", fd); ok += 1; }
      catch (e) { toast.error(`${file.name}: ${apiErrorText(e, "Upload failed")}`); }
    }
    await fetchPhotos();
    if (ok) toast.success(`${ok} photo(s) uploaded. Run the AI scan on each one before submitting.`);
    setUploading(false);
  }, [inspId, fetchPhotos]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp"] }, multiple: true, disabled: readOnly,
  });

  const handleDelete = async (photoId) => {
    if (!confirm("Delete this photo and its findings?")) return;
    try { await api.delete(`/photos/${photoId}`); }
    catch (e) { toast.error(apiErrorText(e, "Delete failed")); return; }
    replaceForPhoto(photoId, []);
    setGroups(prev => {
      const updated = prev.map(g => ({ ...g, photoIds: g.photoIds.filter(id => id !== photoId) })).filter(g => g.photoIds.length > 0);
      saveGroupsToDB(updated, savedAnnot);
      return updated;
    });
    if (lightboxId === photoId) setLightboxId(null);
    fetchPhotos();
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
    toast("Photo moved");
  };

  const handleSaveAnnotation = (photoIds, dataUrl, actions, layout) => {
    const groupId = groups[canvas.groupIdx]?.id;
    if (!groupId) return;
    const newAnnot = { ...savedAnnot, [groupId]: { dataUrl, photoIds, actions, layout, savedAt: new Date().toISOString() } };
    setSavedAnnot(newAnnot);
    saveGroupsToDB(groups, newAnnot);
    toast.success("Annotation saved");
  };

  const labelOf = useMemo(() => {
    const map = {};
    groups.forEach(g => g.photoIds.forEach((id, idx) => { map[id] = `${g.label}.${idx + 1}`; }));
    return map;
  }, [groups]);

  const getGroupPhotos = useCallback((group) =>
    group.photoIds.map((id, idx) => {
      const p = photos.find(ph => ph.id === id);
      if (!p) return null;
      const detections = findingsOf(id).filter(f => f.bbox && isAiFinding(f)).map(f => ({ label: f.defect_type, score: f.confidence, box: f.bbox }));
      return { ...p, number: `${group.label}.${idx+1}`, label: `${group.label}.${idx+1}`, detections };
    }).filter(Boolean), [photos, findingsOf]);

  const canvasGroup = canvas.groupIdx !== null ? groups[canvas.groupIdx] : null;
  const canvasPhotos = useMemo(() => (canvasGroup ? getGroupPhotos(canvasGroup) : NO_FINDINGS), [canvasGroup, getGroupPhotos]);

  const lightboxPhoto = lightboxId ? photos.find(p => p.id === lightboxId) : null;
  const toScan = unscanned.length ? unscanned : photos;

  return (
    <div className={embedded ? "space-y-4" : "max-w-3xl mx-auto space-y-6"}>
      {!embedded && <div className="page-header"><h1 className="page-title">Inspection Photos</h1></div>}

      {!readOnly && (
        <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${isDragActive ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" : "border-slate-200 dark:border-slate-700 hover:border-primary-400"}`}>
          <input {...getInputProps()}/>
          <Upload size={32} className={`mx-auto mb-3 ${isDragActive ? "text-primary-600" : "text-slate-300 dark:text-slate-600"}`}/>
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-primary-600"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Uploading...</div>
          ) : isDragActive ? <p className="text-primary-600 font-medium text-sm">Drop photos here</p> : (
            <><p className="text-sm font-medium text-slate-600 dark:text-slate-400">Drag and drop photos, or <span className="text-primary-600">browse</span></p><p className="text-xs text-slate-400 mt-1">JPEG, PNG, WebP. Max 10MB. Drag photos between groups</p></>
          )}
        </div>
      )}

      {photos.length > 0 && (
        <div className="card p-3 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0 text-sm">
            {unscanned.length === 0 ? (
              <span className="text-emerald-600 font-medium">All {photos.length} photo(s) have been AI scanned.</span>
            ) : (
              <span className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                <AlertTriangle size={15} className="shrink-0 mt-0.5"/>
                <span>{unscanned.length} of {photos.length} photo(s) not scanned yet: <strong>{unscanned.map(p => labelOf[p.id] || "new").join(", ")}</strong>. Every photo must be scanned before you submit.</span>
              </span>
            )}
          </div>
          {!readOnly && (
            <ScanAllButton photos={toScan} countFor={id => findingsOf(id).length} scanner={scanner} label={unscanned.length ? `Scan all unscanned (${unscanned.length})` : "Scan all again"}/>
          )}
        </div>
      )}

      {groups.length > 0 && (
        <div className="space-y-4">
          <AnimatePresence>
            {groups.map((group, gIdx) => {
              const gPhotos  = getGroupPhotos(group);
              const annot    = savedAnnot[group.id];
              const isTarget = dragOver === group.id;
              const groupFindingCount = gPhotos.reduce((s, p) => s + findingsOf(p.id).length, 0);
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
                          {groupFindingCount > 0 && <span className="ml-1 text-amber-500">· {groupFindingCount} finding(s)</span>}
                          {annot && <span className="ml-1 text-emerald-500">· annotated</span>}
                        </span>
                      </div>
                    </div>
                    {!readOnly && (
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
                    )}
                  </div>

                  {annot && (
                    <div className="px-4 pt-3">
                      <div className="relative rounded-xl overflow-hidden border border-emerald-200 dark:border-emerald-800">
                        <img src={annot.dataUrl} alt="annotation" className="w-full object-contain max-h-48 bg-slate-100 dark:bg-slate-950"/>
                        {!readOnly && (
                          <div className="absolute top-2 right-2">
                            <button onClick={() => setSavedAnnot(prev => { const n={...prev}; delete n[group.id]; return n; })} className="w-6 h-6 bg-black/60 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors" title="Remove annotation"><X size={10}/></button>
                          </div>
                        )}
                        <div className="absolute bottom-2 left-2"><span className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.5 rounded-full">Annotated, {new Date(annot.savedAt).toLocaleTimeString()}</span></div>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">The AI scans the original photos below, never this annotated image.</p>
                    </div>
                  )}

                  <div className={`p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 ${isTarget ? "bg-primary-50/30 dark:bg-primary-900/10" : ""}`}>
                    {gPhotos.length === 0 ? (
                      <div className="sm:col-span-2 text-center text-sm text-slate-400 py-4">{isTarget ? "Drop here" : "No photos, drag here or upload above"}</div>
                    ) : (
                      <AnimatePresence>
                        {gPhotos.map(photo => {
                          const pf = findingsOf(photo.id);
                          const scanning = !!scanner.scanning[photo.id];
                          const failed = scanner.failed[photo.id];
                          return (
                            <motion.div key={photo.id} className={`rounded-xl overflow-hidden border bg-slate-50 dark:bg-slate-900 ${!photo.scanned_at && !scanning ? "border-amber-300 dark:border-amber-700" : "border-slate-100 dark:border-slate-800"} ${readOnly ? "" : "cursor-grab active:cursor-grabbing"}`}
                              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                              draggable={!readOnly} onDragStart={e => handleDragStart(e, photo.id, group.id)} onDragEnd={() => { setDragPhoto(null); setDragOver(null); }}>
                              <PhotoWithBoxes photo={photo} findings={pf} className="aspect-video bg-slate-100 dark:bg-slate-800 select-none">
                                <div className="absolute top-1.5 left-1.5"><span className="text-[10px] font-bold bg-white/90 text-slate-800 px-1.5 py-0.5 rounded-full shadow">{photo.label}</span></div>
                                <div className="absolute top-1.5 right-1.5 flex gap-1">
                                  <button onClick={() => setLightboxId(photo.id)} className="w-7 h-7 rounded-full bg-black/60 hover:bg-primary-600 flex items-center justify-center text-white transition-colors" title="Enlarge"><ZoomIn size={12}/></button>
                                  {!readOnly && <button onClick={() => handleDelete(photo.id)} className="w-7 h-7 rounded-full bg-black/60 hover:bg-red-600 flex items-center justify-center text-white transition-colors" title="Delete"><Trash2 size={12}/></button>}
                                </div>
                              </PhotoWithBoxes>
                              <div className="p-2 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <ScanStatus photo={photo} findings={pf} scanning={scanning} failed={failed}/>
                                </div>
                                <FindingList findings={pf} editable={!readOnly} onChanged={updateOne} onRemoved={removeOne}/>
                                {!readOnly && (
                                  <ScanButton photo={photo} scanning={scanning} failed={failed} disabled={!!scanner.progress}
                                    onScan={() => scanner.scanPhoto(photo, pf.length)}/>
                                )}
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
          {!readOnly && (
            <button onClick={() => setGroups(prev => { const updated = [...prev, { id: `g-${Date.now()}`, label: String(prev.length+1), photoIds: [] }]; saveGroupsToDB(updated, savedAnnot); return updated; })} className="btn-secondary w-full flex items-center justify-center gap-2 py-2.5 text-sm">
              <Plus size={15}/> Add New Group
            </button>
          )}
        </div>
      )}

      {photos.length === 0 && !uploading && <p className="text-center text-sm text-slate-400 py-4">No photos yet, upload above</p>}

      <AnnotationModal
        open={canvas.open}
        onClose={() => setCanvas(c => ({ ...c, open: false }))}
        photos={canvasPhotos}
        onSave={handleSaveAnnotation}
        initialActions={canvasGroup ? (savedAnnot[canvasGroup.id]?.actions || NO_FINDINGS) : NO_FINDINGS}
        initialPhotoLayout={canvasGroup ? (savedAnnot[canvasGroup.id]?.layout || null) : null}
      />

      <AnimatePresence>
        {lightboxPhoto && (
          <PhotoLightbox
            photo={{ ...lightboxPhoto, label: labelOf[lightboxPhoto.id] }}
            findings={findingsOf(lightboxPhoto.id)}
            editable={!readOnly}
            onClose={() => setLightboxId(null)}
            onChanged={updateOne}
            onRemoved={removeOne}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
