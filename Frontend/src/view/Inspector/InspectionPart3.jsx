import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, CheckCircle, AlertTriangle, X } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { apiErrorText } from "../../utils/apiError.js";
import { getAnnot } from "../../utils/annotCache.js";
import { capitalise, findingsByPhoto } from "../../utils/findings.js";
import { useInspectionFindings } from "../../utils/usePhotoScan.js";
import { FindingList, PhotoWithBoxes, ScanStatus } from "../../components/PhotoScan.jsx";
import { fmtDate } from "../../utils/reportFormat.js";

const NONE = [];

export default function InspectionPart3() {
  const { state }    = useLocation();
  const navigate     = useNavigate();
  const inspectionId = state?.inspectionId || sessionStorage.getItem("vida_current_inspId");

  const [inspection, setInspection] = useState(null);
  const [photos,     setPhotos]     = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [viewAnnot,  setViewAnnot]  = useState(null);
  const { findings, updateOne, removeOne } = useInspectionFindings(inspectionId);
  const byPhoto = useMemo(() => findingsByPhoto(findings), [findings]);

  const savedAnnot = inspectionId ? getAnnot(inspectionId) : {};
  const ssGroups   = (() => { try { const s = sessionStorage.getItem(`vida_groups_${inspectionId}`); return s ? JSON.parse(s) : []; } catch { return []; } })();
  const navGroups  = state?.groups?.length ? state.groups : ssGroups;
  const groups     = navGroups.length > 0
    ? navGroups
    : photos.length > 0
      ? [{ id: "auto", label: "1", photoIds: photos.map(p => p.id) }]
      : [];

  useEffect(() => {
    if (!inspectionId) { navigate("/inspections"); return; }
    api.get(`/inspections/${inspectionId}`).then(r => setInspection(r.data)).catch(() => {});
    api.get(`/photos/${inspectionId}/list`).then(r => setPhotos(r.data)).catch(() => {});
  }, [inspectionId, navigate]);

  const labelOf = {};
  groups.forEach(g => (g.photoIds || []).forEach((id, i) => { labelOf[id] = `${g.label}.${i + 1}`; }));
  const unscanned = photos.filter(p => !p.scanned_at);

  const handleSubmit = async () => {
    if (unscanned.length) {
      toast.error(`Scan every photo first. Not scanned: ${unscanned.map(p => labelOf[p.id] || "photo").join(", ")}`);
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/inspections/${inspectionId}/submit`);
      sessionStorage.removeItem("vida_part1_draft");
      sessionStorage.removeItem(`vida_groups_${inspectionId}`);
      sessionStorage.removeItem(`vida_annot_${inspectionId}`);
      toast.success("Inspection submitted successfully!");
      navigate("/inspections");
    } catch (e) { toast.error(apiErrorText(e, "Submission failed")); }
    finally { setSubmitting(false); }
  };

  const unlinked = findings.filter(f => !f.photo_id);

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
        {[0, 1, 2].map(i => <div key={i} className="flex-1 h-1.5 rounded-full bg-primary-600"/>)}
      </div>

      {inspection && (
        <motion.div className="card p-5 space-y-3" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Inspection Details</h3>
          {[["Title", inspection.title], ["Building", inspection.buildings?.name], ["Date", fmtDate(inspection.inspection_date)], ["Weather", capitalise(inspection.weather_condition)], ["Floor", inspection.floor_level], ["Area", inspection.area_inspected]].map(([k, v]) => v ? (
            <div key={k} className="flex justify-between gap-4 text-sm py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
              <span className="text-slate-500 dark:text-slate-400">{k}</span>
              <span className="font-medium text-slate-800 dark:text-slate-200 text-right">{v}</span>
            </div>
          ) : null)}
        </motion.div>
      )}

      {unscanned.length > 0 && (
        <div className="card p-4 border-l-4 border-amber-400 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle size={16} className="shrink-0 mt-0.5"/>
          <div>
            <p className="font-semibold">{unscanned.length} photo(s) still need an AI scan</p>
            <p>Not scanned: {unscanned.map(p => labelOf[p.id] || "photo").join(", ")}. Go back to Step 2 and press Scan all.</p>
          </div>
        </div>
      )}

      <motion.div className="card p-5 space-y-4" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
          Photos and Findings <span className="text-xs text-slate-400 font-normal">({photos.length} photos, {findings.length} findings)</span>
        </h3>

        {photos.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No photos uploaded. Go back to Step 2 to upload photos.</p>
        ) : (
          <div className="space-y-5">
            {groups.map(group => {
              const groupPhotos = (group.photoIds || []).map(id => photos.find(p => p.id === id)).filter(Boolean);
              const annot = savedAnnot[group.id];
              if (!groupPhotos.length) return null;
              return (
                <div key={group.id} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <span className="w-7 h-7 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center">{group.label}</span>
                    <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">Group {group.label}</span>
                    {annot && <button onClick={() => setViewAnnot(annot.dataUrl)} className="ml-auto text-[11px] text-emerald-600 hover:underline">View annotation</button>}
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {groupPhotos.map(photo => {
                      const pf = byPhoto[photo.id] || NONE;
                      return (
                        <div key={photo.id} className="flex gap-3 p-3">
                          <PhotoWithBoxes photo={photo} findings={pf} className="shrink-0 w-28 h-20 rounded-lg overflow-hidden bg-slate-100">
                            <span className="absolute top-1 left-1 text-[9px] font-bold bg-white/90 text-slate-800 px-1 rounded-full">{labelOf[photo.id]}</span>
                          </PhotoWithBoxes>
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <ScanStatus photo={photo} findings={pf}/>
                            <FindingList findings={pf} editable onChanged={updateOne} onRemoved={removeOne}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {unlinked.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-1.5">
                <p className="text-xs text-slate-400 mb-2">Findings not linked to a photo</p>
                <FindingList findings={unlinked} editable onChanged={updateOne} onRemoved={removeOne}/>
              </div>
            )}
          </div>
        )}
      </motion.div>

      <div className="flex justify-between pt-2">
        <button onClick={() => navigate(-1)} className="btn-secondary"><ChevronLeft size={16}/> Back</button>
        <motion.button onClick={handleSubmit} disabled={submitting || unscanned.length > 0} className="btn-primary" whileTap={{ scale: 0.97 }}
          title={unscanned.length ? "Scan every photo before submitting" : undefined}>
          {submitting ? "Submitting..." : <span className="flex items-center gap-2"><CheckCircle size={16}/> Submit Inspection</span>}
        </motion.button>
      </div>

      <AnimatePresence>
        {viewAnnot && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewAnnot(null)}>
            <motion.div className="relative max-w-5xl w-full" initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setViewAnnot(null)} className="absolute -top-4 -right-4 w-9 h-9 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center shadow-xl z-10">
                <X size={16}/>
              </button>
              <img src={viewAnnot} alt="annotated canvas" className="w-full rounded-2xl shadow-2xl bg-white"/>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
