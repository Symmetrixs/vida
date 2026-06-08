import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Share2, FileText, User, Search, X, Check, Building2, Calendar, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext.jsx";

const ROLE_COLOR = {
  inspector:        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  facility_manager: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

export default function SharedReports() {
  const { user }                      = useAuth();
  const navigate                      = useNavigate();
  const [sharedWithMe, setSharedWithMe] = useState([]);
  const [users,        setUsers]       = useState([]);
  const [reports,      setReports]     = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [showShare,    setShowShare]   = useState(false);
  const [sharing,      setSharing]     = useState(false);
  const [userSearch,   setUserSearch]  = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [form,         setForm]        = useState({ report_id: "", message: "" });

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      api.get("/reports/shared-with-me"),
      api.get("/reports/shareable-users"),
      api.get("/reports/"),
    ]).then(([s, u, r]) => {
      setSharedWithMe(s.data);
      setUsers(u.data);
      setReports(r.data.filter(rep => rep.status === "published"));
    }).catch(() => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase();
    return users.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.employee_id?.toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const toggleUser = (id) => {
    setSelectedUsers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleShare = async () => {
    if (!form.report_id)          { toast.error("Select a report to share"); return; }
    if (selectedUsers.length === 0) { toast.error("Select at least one recipient"); return; }
    setSharing(true);
    try {
      const res = await api.post("/reports/share", {
        report_id: form.report_id,
        user_ids:  selectedUsers,
        message:   form.message || undefined,
      });
      toast.success("Report shared with " + res.data.shared + " user" + (res.data.shared !== 1 ? "s" : ""));
      setShowShare(false);
      setForm({ report_id: "", message: "" });
      setSelectedUsers([]);
      setUserSearch("");
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to share");
    } finally { setSharing(false); }
  };

  return (
    <div className="space-y-6">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2"><Share2 size={22}/> Shared Reports</h1>
          <p className="page-subtitle">Reports shared with you by other inspectors and facility managers</p>
        </div>
        <button onClick={() => setShowShare(s => !s)} className="btn-primary flex items-center gap-2">
          <Share2 size={15}/> Share Report
        </button>
      </div>

      <AnimatePresence>
        {showShare && (
          <motion.div
            className="card p-5 space-y-4"
            initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }} exit={{ opacity: 0, y: -10, height: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Share2 size={15} className="text-primary-600"/> Share a Published Report
              </h3>
              <button onClick={() => { setShowShare(false); setSelectedUsers([]); setUserSearch(""); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={16}/>
              </button>
            </div>

            <div>
              <label className="label">Report to Share *</label>
              {reports.length === 0 ? (
                <p className="text-sm text-slate-400 p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                  No published reports available. Publish a report first before sharing.
                </p>
              ) : (
                <select value={form.report_id} onChange={e => setForm(f => ({...f, report_id: e.target.value}))} className="input">
                  <option value="">Select report…</option>
                  {reports.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.title} — {r.inspections?.buildings?.name || ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="label">Recipients * <span className="text-xs text-slate-400 font-normal">(inspectors & facility managers only)</span></label>
              <div className="relative mb-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input
                  value={userSearch} onChange={e => setUserSearch(e.target.value)}
                  className="input pl-8 text-sm" placeholder="Search by name, email, or ID…"
                />
              </div>
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedUsers.map(id => {
                    const u = users.find(u => u.id === id);
                    return (
                      <span key={id} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-medium">
                        {u?.name || id}
                        <button onClick={() => toggleUser(id)} className="ml-0.5 hover:text-red-500"><X size={11}/></button>
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-52 overflow-y-auto">
                {filteredUsers.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">No users found</p>
                ) : (
                  filteredUsers.map(u => {
                    const selected = selectedUsers.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => toggleUser(u.id)}
                        className={"w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors " + (selected ? "bg-primary-50 dark:bg-primary-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/50")}
                      >
                        <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xs font-bold text-primary-700 dark:text-primary-300 shrink-0 overflow-hidden">
                          {u.avatar_url ? <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover"/> : (u.name?.[0]?.toUpperCase() || "?")}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{u.name}</p>
                          <p className="text-xs text-slate-400 truncate">{u.employee_id ? u.employee_id + " · " : ""}{u.email}</p>
                        </div>
                        <span className={"text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize shrink-0 " + (ROLE_COLOR[u.role] || "")}>
                          {u.role?.replace("_", " ")}
                        </span>
                        {selected && <Check size={14} className="text-primary-600 shrink-0"/>}
                      </button>
                    );
                  })
                )}
              </div>
              {filteredUsers.length > 0 && (
                <div className="flex gap-2 mt-1.5">
                  <button onClick={() => setSelectedUsers(filteredUsers.map(u => u.id))} className="text-xs text-primary-600 hover:underline">Select all</button>
                  {selectedUsers.length > 0 && <><span className="text-slate-300 dark:text-slate-600">·</span><button onClick={() => setSelectedUsers([])} className="text-xs text-slate-400 hover:underline">Clear</button></>}
                </div>
              )}
            </div>

            <div>
              <label className="label">Message (optional)</label>
              <textarea
                value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))}
                className="input resize-none" rows={2}
                placeholder="Add a note for the recipients…"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-slate-400">
                {selectedUsers.length > 0 ? selectedUsers.length + " recipient" + (selectedUsers.length !== 1 ? "s" : "") + " selected" : "No recipients selected"}
              </p>
              <div className="flex gap-2">
                <button onClick={() => { setShowShare(false); setSelectedUsers([]); setUserSearch(""); }} className="btn-secondary">Cancel</button>
                <button onClick={handleShare} disabled={sharing || !form.report_id || selectedUsers.length === 0} className="btn-primary flex items-center gap-2">
                  {sharing ? "Sharing…" : <><Share2 size={13}/> Share</>}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{[...Array(3)].map((_,i) => <div key={i} className="skeleton h-16 rounded-xl"/>)}</div>
        ) : sharedWithMe.length === 0 ? (
          <div className="p-12 text-center">
            <Share2 size={40} className="text-slate-300 dark:text-slate-700 mx-auto mb-3"/>
            <p className="text-slate-400 text-sm">No reports have been shared with you yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {sharedWithMe.map((s, i) => (
              <motion.div
                key={s.id}
                className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                onClick={() => s.reports?.id && navigate("/inspector/reports/" + s.reports.id)}
              >
                <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-primary-600 dark:text-primary-400"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{s.reports?.title || "Unnamed report"}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {s.reports?.inspections?.buildings?.name && (
                      <span className="flex items-center gap-1 text-xs text-slate-400"><Building2 size={10}/>{s.reports.inspections.buildings.name}</span>
                    )}
                    <span className="text-xs text-slate-300 dark:text-slate-600">·</span>
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <User size={10}/>
                      Shared by {s.users?.name || "Unknown"}
                    </span>
                    <span className="text-xs text-slate-300 dark:text-slate-600">·</span>
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Calendar size={10}/>
                      {new Date(s.shared_at).toLocaleDateString("en-MY")}
                    </span>
                  </div>
                  {s.message && (
                    <p className="text-xs text-slate-400 mt-1 italic">"{s.message}"</p>
                  )}
                </div>
                <span className="badge-green shrink-0">{s.reports?.status}</span>
                {s.reports?.id && (
                  <ExternalLink size={14} className="text-slate-400 shrink-0"/>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}