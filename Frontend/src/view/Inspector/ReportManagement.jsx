import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Plus, Trash2, Eye, Send, Search, Lock,
  ChevronDown, X, Building2, Calendar, User,
} from "lucide-react";
import api from "../../api/axios.js";
import { useAuth } from "../../context/AuthContext.jsx";
import toast from "react-hot-toast";

const STATUS_COLOR = {
  draft:     "badge-gray",
  published: "badge-green",
  submitted: "badge-blue",
};

const SORT_OPTIONS = [
  { value: "newest",   label: "Newest first" },
  { value: "oldest",   label: "Oldest first" },
  { value: "title",    label: "Title A–Z" },
  { value: "building", label: "Building A–Z" },
];

const isLocked = (r) => {
  if (!r.created_at) return false;
  const age = (Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24);
  return age >= 3;
};

function NewReportModal({ inspections, onClose, onCreated }) {
  const [step,       setStep]      = useState(1);
  const [inspId,     setInspId]    = useState("");
  const [form,       setForm]      = useState({ title: "", summary: "", recommendations: "" });
  const [creating,   setCreating]  = useState(false);
  const [search,     setSearch]    = useState("");

  const filtered = inspections.filter(i =>
    i.title?.toLowerCase().includes(search.toLowerCase()) ||
    i.buildings?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const selInsp = inspections.find(i => i.id === inspId);

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error("Report title is required"); return; }
    setCreating(true);
    try {
      const r = await api.post("/reports/", { inspection_id: inspId, ...form });
      toast.success("Report created");
      onCreated(r.data.id);
    } catch { toast.error("Failed to create report"); }
    finally { setCreating(false); }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 300 }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">New Report</h2>
            <p className="text-xs text-slate-400 mt-0.5">Step {step} of 2 — {step === 1 ? "Select inspection" : "Report details"}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X size={18}/></button>
        </div>

        <div className="flex gap-1 px-5 pt-4">
          {["Select Inspection", "Report Details"].map((s, i) => (
            <div key={i} className={`flex-1 h-1 rounded-full ${i < step ? "bg-primary-600" : "bg-slate-200 dark:bg-slate-700"}`}/>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {step === 1 && (
            <>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="input pl-8 text-sm" placeholder="Search inspections…"
                />
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filtered.length === 0 && (
                  <p className="text-center text-sm text-slate-400 py-6">No submitted inspections found</p>
                )}
                {filtered.map(insp => (
                  <button
                    key={insp.id}
                    onClick={() => setInspId(insp.id)}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                      inspId === insp.id
                        ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{insp.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                      <Building2 size={11}/> {insp.buildings?.name || "—"}
                      <span>·</span>
                      <Calendar size={11}/> {insp.inspection_date || new Date(insp.created_at).toLocaleDateString("en-MY")}
                    </p>
                  </button>
                ))}
              </div>
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => { if (!inspId) { toast.error("Select an inspection"); return; } setStep(2); setForm(f => ({ ...f, title: `${selInsp?.title || ""} — Inspection Report` })); }}
                  className="btn-primary"
                >
                  Next →
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {selInsp && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <FileText size={13} className="text-primary-600 shrink-0"/>
                  <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{selInsp.title}</span>
                  <span className="text-slate-400">·</span>
                  <span className="truncate">{selInsp.buildings?.name}</span>
                </div>
              )}
              <div>
                <label className="label">Report Title *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({...f, title: e.target.value}))}
                  className="input" placeholder="e.g. FKM Block A — Inspection Report Q2 2026"
                />
              </div>
              <div>
                <label className="label">Executive Summary</label>
                <textarea
                  value={form.summary}
                  onChange={e => setForm(f => ({...f, summary: e.target.value}))}
                  className="input resize-none" rows={3}
                  placeholder="Brief overview of the inspection findings and overall condition…"
                />
              </div>
              <div>
                <label className="label">General Recommendations</label>
                <textarea
                  value={form.recommendations}
                  onChange={e => setForm(f => ({...f, recommendations: e.target.value}))}
                  className="input resize-none" rows={2}
                  placeholder="Overall remediation priorities and maintenance notes…"
                />
              </div>
              <div className="flex gap-3 justify-between pt-1">
                <button onClick={() => setStep(1)} className="btn-secondary">← Back</button>
                <button onClick={handleCreate} disabled={creating} className="btn-primary">
                  {creating ? "Creating…" : "Create Report"}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function ReportManagement() {
  const { user }                    = useAuth();
  const navigate                    = useNavigate();
  const [reports,      setReports]  = useState([]);
  const [inspections,  setInspections] = useState([]);
  const [loading,      setLoading]  = useState(true);
  const [showNew,      setShowNew]  = useState(false);
  const [search,       setSearch]   = useState("");
  const [statusFilter, setStatus]   = useState("all");
  const [sort,         setSort]     = useState("newest");

  const fetchAll = () => {
    setLoading(true);
    Promise.all([api.get("/reports/"), api.get("/inspections/")])
      .then(([rr, ir]) => { setReports(rr.data); setInspections(ir.data); })
      .catch(() => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchAll(); }, []);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm("Delete this report? This cannot be undone.")) return;
    try {
      await api.delete(`/reports/${id}`);
      toast.success("Report deleted");
      fetchAll();
    } catch { toast.error("Failed to delete"); }
  };

  const handlePublish = async (id, e) => {
    e.stopPropagation();
    try {
      await api.post(`/reports/${id}/publish`);
      toast.success("Report published");
      fetchAll();
    } catch { toast.error("Failed to publish"); }
  };

  const filtered = useMemo(() => {
    let list = [...reports];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.title?.toLowerCase().includes(q) ||
        r.inspections?.title?.toLowerCase().includes(q) ||
        r.inspections?.buildings?.name?.toLowerCase().includes(q) ||
        r.users?.name?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") list = list.filter(r => r.status === statusFilter);
    list.sort((a, b) => {
      if (sort === "newest")   return new Date(b.created_at) - new Date(a.created_at);
      if (sort === "oldest")   return new Date(a.created_at) - new Date(b.created_at);
      if (sort === "title")    return (a.title || "").localeCompare(b.title || "");
      if (sort === "building") return (a.inspections?.buildings?.name || "").localeCompare(b.inspections?.buildings?.name || "");
      return 0;
    });
    return list;
  }, [reports, search, statusFilter, sort]);

  const isAdmin = user?.role === "admin";
  const isFM    = user?.role === "facility_manager";

  return (
    <div className="space-y-6">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2"><FileText size={22}/> Reports</h1>
          <p className="page-subtitle">Generate and manage inspection reports</p>
        </div>
        <motion.button onClick={() => setShowNew(true)} className="btn-primary" whileTap={{ scale: 0.97 }}>
          <Plus size={16}/> New Report
        </motion.button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="card p-3 flex items-center gap-3 flex-1">
          <Search size={16} className="text-slate-400 shrink-0"/>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm placeholder-slate-400 text-slate-700 dark:text-slate-300"
            placeholder="Search by title, building, inspector…"
          />
          {search && <button onClick={() => setSearch("")}><X size={14} className="text-slate-400 hover:text-slate-600"/></button>}
        </div>
        <div className="flex gap-2">
          <div className="card p-1 flex gap-1">
            {["all", "draft", "published"].map(f => (
              <button key={f} onClick={() => setStatus(f)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors capitalize ${statusFilter === f ? "bg-primary-600 text-white" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
                {f === "all" ? "All" : f}
              </button>
            ))}
          </div>
          <div className="card p-1 flex items-center gap-1 px-2">
            <select
              value={sort} onChange={e => setSort(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-600 dark:text-slate-300 outline-none cursor-pointer pr-1"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={12} className="text-slate-400"/>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-4 flex gap-4">
              <div className="skeleton h-12 w-12 rounded-xl"/>
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-1/2 rounded"/>
                <div className="skeleton h-3 w-1/3 rounded"/>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText size={40} className="text-slate-300 dark:text-slate-700 mx-auto mb-3"/>
          <p className="text-slate-400 mb-4">{search || statusFilter !== "all" ? "No reports match your filters" : "No reports yet"}</p>
          {!search && statusFilter === "all" && (
            <button onClick={() => setShowNew(true)} className="btn-primary inline-flex"><Plus size={15}/> Create first report</button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r, i) => {
            const locked = isLocked(r);
            const canEdit = !locked || isAdmin;
            return (
              <motion.div
                key={r.id}
                className="card p-4 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                onClick={() => navigate(`/inspector/reports/${r.id}`)}
              >
                <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                  <FileText size={18} className="text-primary-600 dark:text-primary-400"/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{r.title}</p>
                    {locked && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-500 font-medium">
                        <Lock size={10}/> Locked
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1"><Building2 size={10}/>{r.inspections?.buildings?.name || "—"}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1"><Calendar size={10}/>{new Date(r.created_at).toLocaleDateString("en-MY")}</span>
                    {(isAdmin || isFM) && r.users?.name && (
                      <><span>·</span><span className="flex items-center gap-1"><User size={10}/>{r.users.name}</span></>
                    )}
                  </p>
                  {locked && (
                    <p className="text-[10px] text-amber-500 flex items-center gap-1 mt-0.5">
                      <Lock size={9}/> Reports cannot be edited after 3 days
                    </p>
                  )}
                </div>
                <span className={STATUS_COLOR[r.status] || "badge-gray"}>{r.status}</span>
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => navigate(`/inspector/reports/${r.id}`)}
                    className="btn-ghost p-1.5 rounded-lg" title="View / Edit"
                  >
                    <Eye size={14}/>
                  </button>
                  {r.status === "draft" && canEdit && (
                    <button onClick={(e) => handlePublish(r.id, e)} className="btn-ghost p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" title="Publish">
                      <Send size={13}/>
                    </button>
                  )}
                  {(isAdmin || (!locked && r.created_by === user?.id)) && (
                    <button onClick={(e) => handleDelete(r.id, e)} className="btn-ghost p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete">
                      <Trash2 size={13}/>
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {showNew && (
          <NewReportModal
            inspections={inspections}
            onClose={() => setShowNew(false)}
            onCreated={(id) => { setShowNew(false); navigate(`/inspector/reports/${id}`); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}