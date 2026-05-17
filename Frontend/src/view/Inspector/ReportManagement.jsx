import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FileText, Plus, Trash2, Eye, Send } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

export default function ReportManagement() {
  const [reports, setReports] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ inspection_id: "", title: "", summary: "" });
  const [creating, setCreating] = useState(false);

  const fetch = () => {
    setLoading(true);
    Promise.all([api.get("/reports/"), api.get("/inspections/")]).then(([r, i]) => { setReports(r.data); setInspections(i.data); }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { fetch(); }, []);

  const handleCreate = async () => {
    if (!form.inspection_id || !form.title) { toast.error("Fill in required fields"); return; }
    setCreating(true);
    try {
      await api.post("/reports/", form);
      toast.success("Report created");
      setShowNew(false);
      setForm({ inspection_id: "", title: "", summary: "" });
      fetch();
    } catch { toast.error("Failed"); }
    finally { setCreating(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this report?")) return;
    await api.delete(`/reports/${id}`);
    toast.success("Deleted");
    fetch();
  };

  const handlePublish = async (id) => {
    await api.post(`/reports/${id}/publish`);
    toast.success("Report published");
    fetch();
  };

  const statusColor = (s) => ({ draft: "badge-gray", published: "badge-green", submitted: "badge-blue" }[s] || "badge-gray");

  return (
    <div className="space-y-6">
      <div className="page-header flex items-center justify-between">
        <div><h1 className="page-title flex items-center gap-2"><FileText size={22}/> Reports</h1><p className="page-subtitle">Generate and manage inspection reports</p></div>
        <button onClick={() => setShowNew(s => !s)} className="btn-primary"><Plus size={16}/> New Report</button>
      </div>

      {showNew && (
        <motion.div className="card p-5 space-y-4" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Create Report</h3>
          <div>
            <label className="label">Inspection *</label>
            <select value={form.inspection_id} onChange={e => setForm(f => ({...f, inspection_id: e.target.value}))} className="input">
              <option value="">Select inspection…</option>
              {inspections.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}
            </select>
          </div>
          <div><label className="label">Report Title *</label><input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} className="input" placeholder="e.g. FKM Block A Inspection Report Q1 2025"/></div>
          <div><label className="label">Summary</label><textarea value={form.summary} onChange={e => setForm(f => ({...f, summary: e.target.value}))} className="input resize-none" rows={3} placeholder="Brief summary of findings…"/></div>
          <div className="flex gap-3">
            <button onClick={() => setShowNew(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreate} disabled={creating} className="btn-primary">{creating ? "Creating…" : "Create Report"}</button>
          </div>
        </motion.div>
      )}

      <div className="card overflow-hidden">
        {loading ? <div className="p-6 space-y-3">{[...Array(3)].map((_,i)=><div key={i} className="skeleton h-14 rounded-xl"/>)}</div>
        : reports.length === 0 ? <div className="p-12 text-center"><FileText size={40} className="text-slate-300 dark:text-slate-700 mx-auto mb-3"/><p className="text-slate-400">No reports yet</p></div>
        : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {reports.map((r, i) => (
              <motion.div key={r.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}>
                <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-primary-600 dark:text-primary-400"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{r.title}</p>
                  <p className="text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString("en-MY")}</p>
                </div>
                <span className={statusColor(r.status)}>{r.status}</span>
                <div className="flex items-center gap-1">
                  {r.status === "draft" && <button onClick={() => handlePublish(r.id)} className="btn-ghost p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" title="Publish"><Send size={13}/></button>}
                  <button onClick={() => handleDelete(r.id)} className="btn-ghost p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={13}/></button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
