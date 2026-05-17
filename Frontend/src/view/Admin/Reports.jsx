import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FileText, Search, Eye, Trash2, Download } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetch = () => {
    setLoading(true);
    api.get("/reports/").then(r => setReports(r.data)).catch(() => toast.error("Failed")).finally(() => setLoading(false));
  };
  useEffect(() => { fetch(); }, []);

  const handleDelete = async (id) => {
    if (!confirm("Delete this report?")) return;
    await api.delete(`/reports/${id}`);
    toast.success("Report deleted");
    fetch();
  };

  const statusColor = (s) => ({ draft: "badge-gray", published: "badge-green", submitted: "badge-blue" }[s] || "badge-gray");
  const filtered = reports.filter(r => r.title?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><FileText size={22}/> Reports</h1>
        <p className="page-subtitle">View and manage all inspection reports</p>
      </div>
      <div className="card p-4 flex items-center gap-3">
        <Search size={16} className="text-slate-400 shrink-0"/>
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 bg-transparent outline-none text-sm placeholder-slate-400 text-slate-700 dark:text-slate-300" placeholder="Search reports…"/>
      </div>
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl"/>)}</div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-12">No reports found</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <div className="grid grid-cols-12 px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
              <span className="col-span-5">Title</span>
              <span className="col-span-3">Building</span>
              <span className="col-span-2">Status</span>
              <span className="col-span-2 text-right">Actions</span>
            </div>
            {filtered.map((r, i) => (
              <motion.div key={r.id} className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}>
                <div className="col-span-5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                    <FileText size={14} className="text-primary-600 dark:text-primary-400"/>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{r.title}</p>
                    <p className="text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString("en-MY")}</p>
                  </div>
                </div>
                <span className="col-span-3 text-sm text-slate-500 dark:text-slate-400 truncate">{r.inspections?.buildings?.name || "—"}</span>
                <span className="col-span-2"><span className={statusColor(r.status)}>{r.status}</span></span>
                <div className="col-span-2 flex justify-end gap-1">
                  <button className="btn-ghost p-1.5 rounded-lg" title="View"><Eye size={14}/></button>
                  <button onClick={() => handleDelete(r.id)} className="btn-ghost p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete"><Trash2 size={14}/></button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
