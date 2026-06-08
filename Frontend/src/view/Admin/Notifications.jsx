import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Plus, Trash2, Users, User, ChevronDown, CheckCircle, Info, AlertTriangle, XCircle } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

const TYPE_OPTS = [
  { value: "info",    label: "Info",    color: "bg-blue-500",   icon: Info },
  { value: "success", label: "Success", color: "bg-green-500",  icon: CheckCircle },
  { value: "warning", label: "Warning", color: "bg-yellow-500", icon: AlertTriangle },
  { value: "error",   label: "Error",   color: "bg-red-500",    icon: XCircle },
];

const TARGET_OPTS = [
  { value: "all",              label: "Everyone",           sub: "All active users" },
  { value: "inspector",        label: "All Inspectors",     sub: "Inspectors only" },
  { value: "facility_manager", label: "All Facility Managers", sub: "Facility managers only" },
  { value: "specific",         label: "Specific User",      sub: "Choose one user" },
];

export default function AdminNotifications() {
  const [notifs,   setNotifs]   = useState([]);
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sending,  setSending]  = useState(false);
  const [form,     setForm]     = useState({
    target: "all",
    user_id: "",
    title: "",
    message: "",
    type: "info",
  });

  useEffect(() => {
    Promise.all([api.get("/notifications/"), api.get("/admin/users")])
      .then(([n, u]) => { setNotifs(n.data); setUsers(u.data.filter(u => u.role !== "admin")); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSend = async () => {
    if (!form.title.trim() || !form.message.trim()) { toast.error("Title and message are required"); return; }
    if (form.target === "specific" && !form.user_id) { toast.error("Select a specific user"); return; }
    setSending(true);
    try {
      const payload = {
        title:       form.title,
        message:     form.message,
        type:        form.type,
        target_role: form.target !== "specific" ? form.target : undefined,
        user_id:     form.target === "specific" ? form.user_id : undefined,
      };
      const r = await api.post("/notifications/", payload);
      if (r.data.sent !== undefined) {
        toast.success("Notification sent to " + r.data.sent + " user" + (r.data.sent !== 1 ? "s" : ""));
      } else {
        toast.success("Notification sent");
        setNotifs(prev => [r.data, ...prev]);
      }
      setShowForm(false);
      setForm({ target: "all", user_id: "", title: "", message: "", type: "info" });
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to send"); }
    finally { setSending(false); }
  };

  const handleDelete = async (id) => {
    await api.delete("/notifications/" + id);
    setNotifs(prev => prev.filter(n => n.id !== id));
    toast.success("Deleted");
  };

  const typeInfo = (type) => TYPE_OPTS.find(t => t.value === type) || TYPE_OPTS[0];

  return (
    <div className="space-y-6">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2"><Bell size={22}/> Notifications</h1>
          <p className="page-subtitle">Send system notifications to users or roles</p>
        </div>
        <button onClick={() => setShowForm(s => !s)} className="btn-primary flex items-center gap-2">
          <Plus size={16}/> Send Notification
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            className="card p-5 space-y-4"
            initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }} exit={{ opacity: 0, y: -10, height: 0 }}
            style={{ overflow: "hidden" }}
          >
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Bell size={15} className="text-primary-600"/> New Notification
            </h3>

            <div>
              <label className="label">Send To *</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TARGET_OPTS.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setForm(f => ({...f, target: t.value, user_id: ""}))}
                    className={"p-3 rounded-xl border-2 text-left transition-all " + (
                      form.target === t.value
                        ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                    )}
                  >
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{t.label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{t.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {form.target === "specific" && (
              <div>
                <label className="label">Specific User *</label>
                <select value={form.user_id} onChange={e => setForm(f => ({...f, user_id: e.target.value}))} className="input">
                  <option value="">Select user…</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} — {u.role?.replace("_", " ")} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Type</label>
                <div className="flex gap-2">
                  {TYPE_OPTS.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setForm(f => ({...f, type: t.value}))}
                      className={"flex-1 py-2 rounded-xl text-xs font-semibold transition-all border-2 " + (
                        form.type === t.value
                          ? "border-transparent text-white " + t.color
                          : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} className="input" placeholder="Notification title"/>
              </div>
            </div>

            <div>
              <label className="label">Message *</label>
              <textarea value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))} className="input resize-none" rows={3} placeholder="Notification message…"/>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-slate-400">
                {form.target === "all" ? "Will be sent to all active users" :
                 form.target === "specific" ? (form.user_id ? "Sending to 1 user" : "No user selected") :
                 "Will be sent to all " + form.target.replace("_", " ") + "s"}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleSend} disabled={sending} className="btn-primary flex items-center gap-2">
                  {sending ? "Sending…" : <><Bell size={13}/> Send</>}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Recent System Notifications</h3>
          <span className="text-xs text-slate-400">{notifs.length} total</span>
        </div>
        {loading ? (
          <div className="p-6 space-y-3">{[...Array(4)].map((_,i) => <div key={i} className="skeleton h-14 rounded-xl"/>)}</div>
        ) : notifs.length === 0 ? (
          <div className="p-12 text-center">
            <Bell size={36} className="text-slate-300 dark:text-slate-700 mx-auto mb-3"/>
            <p className="text-sm text-slate-400">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {notifs.map((n, i) => {
              const t = typeInfo(n.type);
              const Icon = t.icon;
              return (
                <motion.div
                  key={n.id}
                  className="flex items-start gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                >
                  <div className={"w-7 h-7 rounded-lg flex items-center justify-center shrink-0 " + t.color}>
                    <Icon size={13} className="text-white"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{n.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-0.5">
                      {new Date(n.created_at).toLocaleDateString("en-MY", { year:"numeric", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}
                      {n.is_read ? " · Read" : " · Unread"}
                    </p>
                  </div>
                  <button onClick={() => handleDelete(n.id)} className="btn-ghost p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0">
                    <Trash2 size={13}/>
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}