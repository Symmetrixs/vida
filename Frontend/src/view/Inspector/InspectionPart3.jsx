import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, CheckCircle, AlertTriangle, X, Expand } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { getAnnot } from "../../utils/annotCache.js";

const DEFECT_COLORS = {
  crack:"#ef4444", faded_paint:"#f59e0b", spalling:"#8b5cf6",
  water_stain:"#3b82f6", rust:"#b45309", mold:"#16a34a", efflorescence:"#64748b",
};




export default function InspectionPart3() {
  const { state }    = useLocation();
  const navigate     = useNavigate();
  const inspectionId = state?.inspectionId || sessionStorage.getItem("vida_current_inspId");

  const [inspection, setInspection] = useState(null);
  const [findings,   setFindings]   = useState([]);
  const [photos,     setPhotos]     = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [viewAnnot,  setViewAnnot]  = useState(null);

  const savedAnnot = inspectionId ? getAnnot(inspectionId) : {};
  const _ssGroups  = (() => { try { const s = sessionStorage.getItem(`vida_groups_${inspectionId}`); return s ? JSON.parse(s) : []; } catch { return []; } })();
  const _navGroups = state?.groups?.length ? state.groups : _ssGroups;
  const groups     = _navGroups.length > 0
    ? _navGroups
    : photos.length > 0
      ? [{ id: "auto", label: "1", photoIds: photos.map(p => p.id) }]
      : [];

  useEffect(() => {
    if (!inspectionId) { navigate("/inspector/inspections"); return; }
    api.get(`/inspections/${inspectionId}`)
      .then(r => setInspection(r.data))
      .catch(() => {});
    api.get(`/photos/${inspectionId}/list`)
      .then(r => setPhotos(r.data))
      .catch(() => {});
    api.get(`/findings/?inspection_id=${inspectionId}`)
      .then(r => setFindings(r.data))
      .catch(() => setFindings([]));
  }, [inspectionId]);

  const deleteFinding = async (findingId) => {
    try {
      await api.delete(`/findings/${findingId}`);
      setFindings(prev => prev.filter(f => f.id !== findingId));
      toast.success("Finding removed");
    } catch { toast.error("Failed to remove finding"); }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post(`/inspections/${inspectionId}/submit`);
      sessionStorage.removeItem("vida_part1_draft");
      sessionStorage.removeItem(`vida_groups_${inspectionId}`);
      sessionStorage.removeItem(`vida_aiResults_${inspectionId}`);
      sessionStorage.removeItem(`vida_annot_${inspectionId}`);
      toast.success("Inspection submitted successfully!");
      navigate("/inspector/inspections");
    } catch { toast.error("Submission failed"); }
    finally { setSubmitting(false); }
  };

  const photoFindings    = (pid) => findings.filter(f => f.photo_id === pid);
  const unlinkedFindings = findings.filter(f => !f.photo_id);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <span className="badge-blue">Step 3 of 3</span> Review & Submit
        </div>
        <h1 className="page-title">Review Inspection</h1>
        <p className="page-subtitle">Confirm all details before submitting</p>
      </div>
      <div className="flex gap-2 mb-2">
        {["General Info","Findings","Review"].map((s,i) => (
          <div key={i} className="flex-1 h-1.5 rounded-full bg-primary-600"/>
        ))}
      </div>

      {inspection && (
        <motion.div className="card p-5 space-y-3" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Inspection Details</h3>
          {[["Title", inspection.title], ["Building", inspection.buildings?.name], ["Date", inspection.inspection_date], ["Weather", inspection.weather_condition], ["Floor", inspection.floor_level], ["Area", inspection.area_inspected]].map(([k,v]) => v ? (
            <div key={k} className="flex justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
              <span className="text-slate-500 dark:text-slate-400">{k}</span>
              <span className="font-medium text-slate-800 dark:text-slate-200 capitalize">{v}</span>
            </div>
          ) : null)}
        </motion.div>
      )}

      <motion.div className="card p-5 space-y-4" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
          <AlertTriangle size={15} className="text-amber-500"/>
          Photos & Findings
          <span className="text-xs text-slate-400 font-normal">({photos.length} photos · {findings.length} findings)</span>
        </h3>

        {photos.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No photos uploaded — go back to Step 2 to upload photos</p>
        ) : groups.length > 0 ? (
          <div className="space-y-5">
            {groups.map((group) => {
              const groupPhotos  = group.photoIds?.map(id => photos.find(p => p.id === id)).filter(Boolean) || [];
              const annot        = savedAnnot[group.id];
              const groupFinds   = findings.filter(f => group.photoIds?.includes(f.photo_id));
              if (!groupPhotos.length) return null;
              return (
                <div key={group.id} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <span className="w-7 h-7 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center">{group.label}</span>
                    <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">Group {group.label}</span>
                    <span className="text-xs text-slate-400">{groupPhotos.length} photo{groupPhotos.length !== 1 ? "s" : ""} · {groupFinds.length} finding{groupFinds.length !== 1 ? "s" : ""}</span>
                    {annot && <span className="ml-auto text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">annotated</span>}
                  </div>
                  {annot && (
                    <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                      <img src={annot.dataUrl} alt="annotation" className="w-full rounded-lg object-contain max-h-48 bg-slate-950 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setViewAnnot(annot.dataUrl)}/>
                      <p className="text-[10px] text-slate-400 mt-1 text-center">Group canvas annotation — click to enlarge</p>
                    </div>
                  )}
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {groupPhotos.map((photo, pIdx) => {
                      const pFindings = photoFindings(photo.id);
                      return (
                        <div key={photo.id} className="flex gap-3 p-3">
                          <div className="relative shrink-0 w-20 h-16">
                            <img src={photo.url} alt="photo" className="w-full h-full object-cover rounded-lg"/>
                            <span className="absolute top-1 left-1 text-[9px] font-bold bg-black/60 text-white px-1 rounded-full">{group.label}.{pIdx+1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            {pFindings.length === 0 ? (
                              <p className="text-xs text-slate-400 mt-1">No AI findings</p>
                            ) : (
                              <>
                                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{pFindings.length} finding(s)</p>
                                <div className="space-y-1">
                                  {pFindings.map(f => (
                                    <div key={f.id} className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm text-white" style={{ background: DEFECT_COLORS[f.defect_type] || "#6366f1" }}>
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="font-semibold capitalize truncate">{f.defect_type?.replace("_"," ")}</span>
                                        <span className="opacity-80 text-xs shrink-0">· {f.severity}</span>
                                        {f.confidence && <span className="opacity-70 text-xs shrink-0">· {Math.round(f.confidence*100)}%</span>}
                                      </div>
                                      <button onClick={() => deleteFinding(f.id)} className="ml-2 w-6 h-6 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center transition-colors shrink-0"><X size={12}/></button>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {unlinkedFindings.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-1.5">
                <p className="text-xs text-slate-400 mb-2">Other findings (not linked to a photo)</p>
                {unlinkedFindings.map(f => (
                  <div key={f.id} className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm text-white" style={{ background: DEFECT_COLORS[f.defect_type] || "#6366f1" }}>
                    <span className="font-semibold capitalize">{f.defect_type?.replace("_"," ")} · {f.severity}</span>
                    <button onClick={() => deleteFinding(f.id)} className="ml-2 w-6 h-6 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center transition-colors"><X size={12}/></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {photos.map(photo => {
              const pFindings = photoFindings(photo.id);
              return (
                <div key={photo.id} className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-900/50">
                  <div className="flex gap-3 p-3">
                    <img src={photo.url} alt="photo" className="w-20 h-16 object-cover rounded-lg shrink-0"/>
                    <div className="flex-1 min-w-0">
                      {pFindings.length === 0 ? <p className="text-xs text-slate-400 mt-1">No AI findings</p> : (
                        <div className="space-y-1.5">
                          {pFindings.map(f => (
                            <div key={f.id} className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm text-white" style={{ background: DEFECT_COLORS[f.defect_type] || "#6366f1" }}>
                              <span className="font-semibold capitalize">{f.defect_type?.replace("_"," ")} · {f.severity}</span>
                              <button onClick={() => deleteFinding(f.id)} className="ml-2 w-6 h-6 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center transition-colors"><X size={12}/></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      <div className="flex justify-between pt-2">
        <button onClick={() => navigate(-1)} className="btn-secondary"><ChevronLeft size={16}/> Back</button>
        <motion.button onClick={handleSubmit} disabled={submitting} className="btn-primary" whileTap={{ scale: 0.97 }}>
          {submitting ? "Submitting…" : <span className="flex items-center gap-2"><CheckCircle size={16}/> Submit Inspection</span>}
        </motion.button>
      </div>

      <AnimatePresence>
        {viewAnnot && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewAnnot(null)}>
            <motion.div className="relative max-w-5xl w-full" initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setViewAnnot(null)} className="absolute -top-4 -right-4 w-9 h-9 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center shadow-xl z-10">
                <X size={16}/>
              </button>
              <img src={viewAnnot} alt="annotated canvas" className="w-full rounded-2xl shadow-2xl"/>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}