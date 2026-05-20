import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users as UsersIcon, Search, Pencil, Trash2, X, Check, ShieldCheck, ShieldX, Clock } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

const ROLES = ["inspector", "facility_manager", "admin"];

function UserModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({ name: user?.name || "", role: user?.role || "inspector", is_active: user?.is_active ?? true });
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await api.put(`/admin/users/${user.id}`, form);
      toast.success("User updated");
      onSaved();
    } catch { toast.error("Update failed"); }
    finally { setLoading(false); }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="card w-full max-w-md p-6 shadow-2xl" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-slate-900 dark:text-white">Edit User</h3>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X size={16}/></button>
        </div>
        <div className="space-y-4">
          <div><label className="label">Name</label><input value={form.name} onChange={(e) => setForm(f => ({...f, name: e.target.value}))} className="input"/></div>
          <div>
            <label className="label">Role</label>
            <select value={form.role} onChange={(e) => setForm(f => ({...f, role: e.target.value}))} className="input">
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="active" checked={form.is_active} onChange={(e) => setForm(f => ({...f, is_active: e.target.checked}))} className="w-4 h-4 accent-primary-600"/>
            <label htmlFor="active" className="text-sm text-slate-700 dark:text-slate-300">Active account</label>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={loading} className="btn-primary flex-1">{loading ? "Saving..." : "Save changes"}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [pending, setPending] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState(null);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      api.get("/admin/users"),
      api.get("/admin/pending-approvals"),
    ]).then(([u, p]) => {
      setUsers(u.data);
      setPending(p.data);
    }).catch(() => toast.error("Failed to load users")).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const handleDelete = async (id) => {
    if (!confirm("Delete this user?")) return;
    await api.delete(`/admin/users/${id}`);
    toast.success("User deleted");
    fetchAll();
  };

  const handleApprove = async (id) => {
    try {
      await api.patch(`/admin/users/${id}/approve`);
      toast.success("Admin account approved");
      fetchAll();
    } catch { toast.error("Failed to approve"); }
  };

  const handleReject = async (id) => {
    if (!confirm("Reject this admin account request?")) return;
    try {
      await api.patch(`/admin/users/${id}/reject`);
      toast.success("Admin account rejected");
      fetchAll();
    } catch { toast.error("Failed to reject"); }
  };

  const filtered = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const roleColor = (r) => ({ admin: "badge-red", facility_manager: "badge-blue", inspector: "badge-green" }[r] || "badge-gray");

  const approvalBadge = (u) => {
    if (u.role !== "admin") return null;
    if (u.is_approved === true) return <span className="badge-green">approved</span>;
    if (u.is_approved === false) return <span className="badge-red">rejected</span>;
    return <span className="badge-yellow">pending</span>;
  };

  return (
    <div className="space-y-6">
      <div className="page-header flex items-center justify-between">
        <div><h1 className="page-title flex items-center gap-2"><UsersIcon size={22}/> User Management</h1><p className="page-subtitle">Manage inspectors and administrators</p></div>
      </div>

      <AnimatePresence>
        {pending.length > 0 && (
          <motion.div
            className="card overflow-hidden border-amber-200 dark:border-amber-800"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            style={{ borderColor: undefined }}
          >
            <div className="px-5 py-3.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/50 flex items-center gap-2">
              <Clock size={16} className="text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Pending Admin Approvals ({pending.length})
              </span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {pending.map((u, i) => (
                <motion.div
                  key={u.id}
                  className="flex items-center gap-4 px-5 py-3.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-700 dark:text-amber-300 font-bold text-sm shrink-0">
                    {u.name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{u.name}</p>
                    <p className="text-xs text-slate-400 truncate">{u.email}</p>
                  </div>
                  <span className="text-xs text-slate-400 hidden sm:block">
                    {new Date(u.created_at).toLocaleDateString("en-MY")}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <motion.button
                      onClick={() => handleApprove(u.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors"
                      whileTap={{ scale: 0.96 }}
                    >
                      <ShieldCheck size={13}/> Approve
                    </motion.button>
                    <motion.button
                      onClick={() => handleReject(u.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 text-xs font-medium transition-colors"
                      whileTap={{ scale: 0.96 }}
                    >
                      <ShieldX size={13}/> Reject
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="card p-4 flex items-center gap-3">
        <Search size={16} className="text-slate-400 shrink-0"/>
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 bg-transparent outline-none text-sm text-slate-700 dark:text-slate-300 placeholder-slate-400" placeholder="Search by name or email…"/>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[...Array(5)].map((_, i) => <div key={i} className="p-4 flex gap-4"><div className="skeleton h-10 w-10 rounded-full"/><div className="flex-1 space-y-2"><div className="skeleton h-4 w-1/3 rounded"/><div className="skeleton h-3 w-1/2 rounded"/></div></div>)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-12">No users found</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((u) => (
              <div key={u.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold text-sm shrink-0">
                  {u.name?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{u.name}</p>
                  <p className="text-xs text-slate-400 truncate">{u.email}</p>
                </div>
                <span className={roleColor(u.role)}>{u.role?.replace("_", " ")}</span>
                {approvalBadge(u)}
                <span className={u.is_active ? "badge-green" : "badge-gray"}>{u.is_active ? "Active" : "Inactive"}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditUser(u)} className="btn-ghost p-1.5 rounded-lg"><Pencil size={14}/></button>
                  <button onClick={() => handleDelete(u.id)} className="btn-ghost p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={14}/></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {editUser && <UserModal user={editUser} onClose={() => setEditUser(null)} onSaved={() => { setEditUser(null); fetchAll(); }} />}
      </AnimatePresence>
    </div>
  );
}