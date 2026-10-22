import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Hammer, X, Plus, User, Eye, ClipboardList } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { apiErrorText } from "../../utils/apiError.js";
import clsx from "clsx";
import { JobRow, ListShell } from "../../components/RepairParts.jsx";
import { SEVERITY_CLASS, fmtDateTime } from "../../utils/complaintUi.js";
import { JOB_STATUS_LABEL, localToday } from "../../utils/repairUi.js";

const JOB_TABS = ["open", "in_progress", "awaiting_review", "done"];

function CreateModal({ inspection, onClose, onCreated }) {
  const [workers, setWorkers] = useState([]);
  const [form, setForm] = useState({ worker_id: "", due_date: "", note: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/repairs/staff").then(r => setWorkers(r.data)).catch(e => toast.error(apiErrorText(e, "Failed to load maintenance staff")));
  }, []);

  const handleCreate = async () => {
    if (form.due_date && !form.worker_id) { toast.error("A due date needs an assigned worker"); return; }
    if (form.due_date && form.due_date < localToday()) { toast.error("Due date cannot be in the past"); return; }
    setBusy(true);
    try {
      const r = await api.post("/repairs/", {
        inspection_id: inspection.id,
        worker_id: form.worker_id || null,
        due_date: form.due_date || null,
        note: form.note.trim() || null,
      }, { timeout: 180000 });
      toast.success(`${r.data.reference} created${form.worker_id ? " and assigned" : " on the Job Board"}`);
      if (!r.data.before_scanned) toast("The AI scan of the inspection photos was not available. Before counts will be empty.");
      onCreated(r.data);
    } catch (e) { toast.error(apiErrorText(e, "Could not create the repair job")); }
    finally { setBusy(false); }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <motion.div className="card w-full max-w-lg p-6 shadow-2xl" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Create repair job</h3>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">{[inspection.reference, inspection.complaint_reference].filter(Boolean).join(" · ")}</p>
          </div>
          <button onClick={onClose} disabled={busy} className="btn-ghost p-1.5 rounded-lg"><X size={16}/></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">Assign to <span className="text-slate-400 font-normal">(leave empty to post on the Job Board)</span></label>
            <select value={form.worker_id} onChange={e => setForm(f => ({ ...f, worker_id: e.target.value }))} className="input">
              <option value="">Post on the Job Board</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.name} ({w.active} active{w.overdue ? `, ${w.overdue} overdue` : ""})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Due date <span className="text-slate-400 font-normal">(optional, needs a worker)</span></label>
            <input type="date" min={localToday()} value={form.due_date} disabled={!form.worker_id} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="input"/>
          </div>
          <div>
            <label className="label">Instructions <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className="input resize-none" rows={3} maxLength={2000} placeholder="e.g. Seal the crack and repaint the whole wall panel"/>
          </div>
          <p className="text-xs text-slate-400">The inspection photos are scanned by the AI model when the job is created, so this can take a little while.</p>
          <div className="flex gap-3">
            <button onClick={onClose} disabled={busy} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleCreate} disabled={busy} className="btn-primary flex-1">{busy ? "Scanning and creating..." : "Create job"}</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function RepairAssignment() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("ready");
  const [candidates, setCandidates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.get("/repairs/candidates"), api.get("/repairs/")])
      .then(([c, j]) => { setCandidates(c.data); setJobs(j.data); })
      .catch(e => toast.error(apiErrorText(e, "Failed to load repair jobs")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const tabs = [{ key: "ready", label: "Ready for repair", count: candidates.length }, ...JOB_TABS.map(s => ({ key: s, label: JOB_STATUS_LABEL[s], count: jobs.filter(j => j.status === s).length }))];
  const visibleJobs = jobs.filter(j => j.status === tab);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><Hammer size={22}/> Repair Assignment</h1>
        <p className="page-subtitle">Reviewed inspections ready to become repair jobs. Assign a worker or post the job on the Job Board.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={clsx("px-4 py-2 rounded-xl text-sm font-medium transition-colors capitalize", tab === t.key ? "bg-primary-600 text-white" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800")}>
            {t.label} <span className="opacity-75">({t.count})</span>
          </button>
        ))}
      </div>

      {tab === "ready" ? (
        <ListShell loading={loading} empty={candidates.length === 0 && "No reviewed inspections are waiting for a repair job"} icon={ClipboardList}>
          {candidates.map(c => (
            <div key={c.id} className="px-5 py-4 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{c.reference}</span>
                  {c.complaint_reference && <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{c.complaint_reference}</span>}
                  <span className={SEVERITY_CLASS[c.severity]}>{c.severity}</span>
                  <span className="text-xs text-slate-400">Reviewed {fmtDateTime(c.assessed_at)}{c.assessor ? ` by ${c.assessor}` : ""}</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 mt-1 truncate">{c.title}</p>
                <p className="text-xs text-slate-400 truncate">{[c.buildings?.name, c.floor_level, c.area_inspected].filter(Boolean).join(" · ")}</p>
                {c.severity_note && <p className="text-xs text-slate-500 dark:text-slate-400 truncate"><span className="font-medium">Note:</span> {c.severity_note}</p>}
              </div>
              <span className="text-xs text-slate-400 flex items-center gap-1"><User size={12}/> {c.inspector_name || "Unknown"}</span>
              <Link to={`/inspections/${c.id}/review`} className="btn-secondary text-xs"><Eye size={13}/> View</Link>
              <button onClick={() => setCreating(c)} className="btn-primary text-xs"><Plus size={13}/> Create job</button>
            </div>
          ))}
        </ListShell>
      ) : (
        <ListShell loading={loading} empty={visibleJobs.length === 0 && `No jobs ${JOB_STATUS_LABEL[tab]}`} icon={Hammer}>
          {visibleJobs.map((job, i) => <JobRow key={job.id} job={job} index={i} showWorker/>)}
        </ListShell>
      )}

      <AnimatePresence>
        {creating && (
          <CreateModal inspection={creating} onClose={() => setCreating(null)} onCreated={(job) => { setCreating(null); navigate(`/jobs/${job.id}`); }}/>
        )}
      </AnimatePresence>
    </div>
  );
}
