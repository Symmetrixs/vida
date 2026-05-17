import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bell, Plus, Trash2, X } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

export default function AdminNotifications() {
  const [notifs, setNotifs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ user_id: "", title: "", message: "", type: "info" });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    Promise.all([api.get("/notifications/"), api.get("/admin/users")]).then(([n, u]) => {
      setNotifs(n.data); setUsers(u.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSend = async () => {
    if (!form.user_id || !form.title || !form.message) { toast.error("All fields required"); return; }
    setSending(true);
    try {
      const r = await api.post("/notifications/", form);
      setNotifs(prev => [r.data, ...prev]);
      setShowForm(false);
      setForm({ user_id: "", title: "", message: "", type: "info" });
      toast.success("Notification sent");
    } catch { toast.error("Failed to send"); }
    finally { setSending(false); }
  };

  const handleDelete = async (id) => {
    await api.delete(`/notifications/${id}`);
    setNotifs(prev => prev.filter(n => n.id !== id));
    toast.success("Deleted");
  };

  return (
    <div className="space-y-6">
      <div className="page-header flex items-center justify-between">
        <div><h1 className="page-title flex items-center gap-2"><Bell size={22}/> Notifications</h1><p className="page-subtitle">Send and manage system notifications</p></div>
        <button onClick={() => setShowForm(s => !s)} className="btn-primary"><Plus size={16}/> Send Notification</button>
      </div>

      {showForm && (
        <motion.div className="card p-5" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">New Notification</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Recipient</label>
                <select value={form.user_id} onChange={e => setForm(f => ({...f, user_id: e.target.value}))} className="input">
                  <option value="">Select user…</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                </select>
              </div>
              <div>
                <label className="label">Type</label>
                <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))} className="input">
                  {["info","success","warning","error"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div><label className="label">Title</label><input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} className="input" placeholder="Notification title"/></div>
            <div><label className="label">Message</label><textarea value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))} className="input resize-none" rows={3} placeholder="Notification message…"/></div>
            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSend} disabled={sending} className="btn-primary">{sending ? "Sending…" : "Send"}</button>
            </div>
          </div>
        </motion.div>
      )}

      <div className="card overflow-hidden">
        {loading ? <div className="p-6 space-y-3">{[...Array(4)].map((_,i)=><div key={i} className="skeleton h-14 rounded-xl"/>)}</div>
        : notifs.length === 0 ? <p className="text-center text-sm text-slate-400 py-12">No notifications</p>
        : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {notifs.map((n, i) => (
              <motion.div key={n.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}>
                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${{info:"bg-blue-500",success:"bg-green-500",warning:"bg-yellow-500",error:"bg-red-500"}[n.type]||"bg-slate-400"}`}/>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{n.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{n.message}</p>
                </div>
                <button onClick={() => handleDelete(n.id)} className="btn-ghost p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={13}/></button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
