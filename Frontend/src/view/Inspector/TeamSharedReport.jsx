import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Share2, FileText, Users } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

export default function TeamSharedReport() {
  const [shared, setShared] = useState([]);
  const [teams,  setTeams]  = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showShare, setShowShare] = useState(false);
  const [form, setForm] = useState({ report_id: "", team_id: "", message: "" });
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/teams/shared-reports"),
      api.get("/teams/"),
      api.get("/reports/"),
    ]).then(([s, t, r]) => {
      setShared(s.data);
      setTeams(t.data);
      setReports(r.data.filter(rep => rep.status === "published"));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleShare = async () => {
    if (!form.report_id || !form.team_id) { toast.error("Select report and team"); return; }
    setSharing(true);
    try {
      await api.post("/teams/share-report", form);
      toast.success("Report shared with team");
      setShowShare(false);
      setForm({ report_id: "", team_id: "", message: "" });
      const r = await api.get("/teams/shared-reports");
      setShared(r.data);
    } catch { toast.error("Failed to share"); }
    finally { setSharing(false); }
  };

  return (
    <div className="space-y-6">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2"><Share2 size={22}/> Team Shared Reports</h1>
          <p className="page-subtitle">Reports shared across your teams</p>
        </div>
        <button onClick={() => setShowShare(s => !s)} className="btn-primary"><Share2 size={16}/> Share Report</button>
      </div>

      {showShare && (
        <motion.div className="card p-5 space-y-4" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Share a Report</h3>
          <div>
            <label className="label">Published Report *</label>
            <select value={form.report_id} onChange={e => setForm(f => ({...f, report_id: e.target.value}))} className="input">
              <option value="">Select report…</option>
              {reports.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Team *</label>
            <select value={form.team_id} onChange={e => setForm(f => ({...f, team_id: e.target.value}))} className="input">
              <option value="">Select team…</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Message (optional)</label>
            <textarea value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))} className="input resize-none" rows={2} placeholder="Add a note for your team…"/>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowShare(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleShare} disabled={sharing} className="btn-primary">{sharing ? "Sharing…" : "Share"}</button>
          </div>
        </motion.div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{[...Array(3)].map((_,i) => <div key={i} className="skeleton h-16 rounded-xl"/>)}</div>
        ) : shared.length === 0 ? (
          <div className="p-12 text-center">
            <Share2 size={40} className="text-slate-300 dark:text-slate-700 mx-auto mb-3"/>
            <p className="text-slate-400">No shared reports yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {shared.map((s, i) => (
              <motion.div key={s.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}>
                <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-primary-600 dark:text-primary-400"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{s.reports?.title || "Unnamed report"}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Users size={12} className="text-slate-400"/>
                    <span className="text-xs text-slate-400">{s.teams?.name}</span>
                    <span className="text-xs text-slate-300 dark:text-slate-600">·</span>
                    <span className="text-xs text-slate-400">{new Date(s.shared_at).toLocaleDateString("en-MY")}</span>
                  </div>
                  {s.message && <p className="text-xs text-slate-400 mt-1 italic">"{s.message}"</p>}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
