import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, CheckCircle, AlertTriangle, FileText } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

export default function InspectionPart3() {
  const { state } = useLocation();
  const navigate  = useNavigate();
  const inspectionId = state?.inspectionId;
  const [inspection, setInspection] = useState(null);
  const [findings,   setFindings]   = useState([]);
  const [photos,     setPhotos]     = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!inspectionId) { navigate("/inspector/inspections"); return; }
    Promise.all([
      api.get(`/inspections/${inspectionId}`),
      api.get(`/findings/?inspection_id=${inspectionId}`),
      api.get(`/photos/${inspectionId}/list`),
    ]).then(([i, f, p]) => { setInspection(i.data); setFindings(f.data); setPhotos(p.data); }).catch(() => {});
  }, [inspectionId]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post(`/inspections/${inspectionId}/submit`);
      toast.success("Inspection submitted successfully!");
      navigate("/inspector/inspections");
    } catch { toast.error("Submission failed"); }
    finally { setSubmitting(false); }
  };

  const SCOLOR = { low: "badge-green", medium: "badge-yellow", high: "badge-red", critical: "text-white bg-red-700 badge" };

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
          {[["Title", inspection.title], ["Building", inspection.buildings?.name], ["Date", inspection.inspection_date], ["Weather", inspection.weather_condition], ["Floor", inspection.floor_level], ["Area", inspection.area_inspected]].map(([k, v]) => v ? (
            <div key={k} className="flex justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
              <span className="text-slate-500 dark:text-slate-400">{k}</span>
              <span className="font-medium text-slate-800 dark:text-slate-200 capitalize">{v}</span>
            </div>
          ) : null)}
        </motion.div>
      )}

      <motion.div className="card p-5" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-3 flex items-center gap-2"><AlertTriangle size={15} className="text-amber-500"/> Findings ({findings.length})</h3>
        {findings.length === 0 ? <p className="text-sm text-slate-400">No findings recorded</p> : (
          <div className="space-y-2">
            {findings.map(f => (
              <div key={f.id} className="flex items-center justify-between text-sm px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <span className="capitalize text-slate-700 dark:text-slate-300">{f.defect_type?.replace("_"," ")}</span>
                <span className={SCOLOR[f.severity] || "badge-gray"}>{f.severity}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <motion.div className="card p-5" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-3">Photos ({photos.length})</h3>
        {photos.length === 0 ? <p className="text-sm text-slate-400">No photos uploaded</p> : (
          <div className="flex flex-wrap gap-2">
            {photos.map(p => <img key={p.id} src={p.url} alt="inspection" className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700"/>)}
          </div>
        )}
      </motion.div>

      <div className="flex justify-between pt-2">
        <button onClick={() => navigate(-1)} className="btn-secondary"><ChevronLeft size={16}/> Back</button>
        <motion.button onClick={handleSubmit} disabled={submitting} className="btn-primary" whileTap={{ scale: 0.97 }}>
          {submitting ? "Submitting…" : <span className="flex items-center gap-2"><CheckCircle size={16}/> Submit Inspection</span>}
        </motion.button>
      </div>
    </div>
  );
}
