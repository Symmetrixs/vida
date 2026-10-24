import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users as UsersIcon, Search, Pencil, Trash2, X, UserPlus, UserCheck, Clock } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { apiErrorText } from "../../utils/apiError.js";
import clsx from "clsx";
import { useAuth } from "../../context/auth.js";
import { ROLE_OPTIONS, roleBadge, roleLabel } from "../../utils/roles.js";

const EMPTY = { name: "", email: "", employee_id: "", password: "", roles: ["inspector"], is_active: true };

function RolePicker({ value, onChange, lockAdmin }) {
  const toggle = (role) => {
    if (lockAdmin && role === "admin") return;
    onChange(value.includes(role) ? value.filter(r => r !== role) : [...value, role]);
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {ROLE_OPTIONS.map(o => {
        const checked = value.includes(o.value);
        const locked = lockAdmin && o.value === "admin";
        return (
          <button key={o.value} type="button" onClick={() => toggle(o.value)} disabled={locked}
            className={clsx("p-3 rounded-xl border-2 text-left transition-all", checked ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600", locked && "opacity-60 cursor-not-allowed")}>
            <div className="flex items-center gap-2">
              <input type="checkbox" readOnly checked={checked} className="w-4 h-4 accent-primary-600 pointer-events-none"/>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{o.label}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 ml-6">{locked ? "You cannot remove your own admin role" : o.desc}</p>
          </button>
        );
      })}
    </div>
  );
}

function StaffModal({ staff, isSelf, onClose, onSaved }) {
  const creating = !staff;
  const [form, setForm] = useState(creating ? EMPTY : {
    name: staff.name || "", email: staff.email || "", employee_id: staff.employee_id || "",
    password: "", roles: staff.roles || [], is_active: staff.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (creating && !form.email.trim()) { toast.error("Email is required"); return; }
    if ((creating || form.password) && form.password.length < 8) { toast.error("Temporary password must be at least 8 characters"); return; }
    if (form.roles.length === 0) { toast.error("Give the account at least one role"); return; }
    setSaving(true);
    try {
      if (creating) {
        await api.post("/admin/users", {
          name: form.name.trim(), email: form.email.trim(), password: form.password,
          employee_id: form.employee_id.trim() || null, roles: form.roles,
        });
        toast.success("Account created");
      } else {
        await api.put(`/admin/users/${staff.id}`, {
          name: form.name.trim(), employee_id: form.employee_id.trim(), roles: form.roles,
          is_active: form.is_active, password: form.password || undefined,
        });
        toast.success("Account updated");
      }
      onSaved();
    } catch (e) {
      toast.error(apiErrorText(e, "Please check the form and try again"));
    } finally { setSaving(false); }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="card w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-thin" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-slate-900 dark:text-white">{creating ? "Create Staff Account" : "Edit Staff Account"}</h3>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X size={16}/></button>
        </div>
        <div className="space-y-4">
          <div><label className="label">Full name</label><input value={form.name} onChange={set("name")} className="input" maxLength={100}/></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Email</label>
              <input type="email" value={form.email} onChange={set("email")} className="input" disabled={!creating} placeholder="name@utem.edu.my"/>
            </div>
            <div><label className="label">Matric No. / Employee ID</label><input value={form.employee_id} onChange={set("employee_id")} className="input" maxLength={40}/></div>
          </div>
          <div>
            <label className="label">{creating ? "Temporary password" : "New temporary password"} {!creating && <span className="text-slate-400 font-normal">(leave blank to keep)</span>}</label>
            <input type="text" value={form.password} onChange={set("password")} className="input" autoComplete="new-password" placeholder="At least 8 characters"/>
            <p className="text-[11px] text-slate-400 mt-1">Give this to the staff member. They can change it from their Profile page.</p>
          </div>
          <div>
            <label className="label">Roles</label>
            <RolePicker value={form.roles} onChange={(roles) => setForm(f => ({ ...f, roles }))} lockAdmin={isSelf}/>
          </div>
          {!creating && (
            <div className="flex items-center gap-3">
              <input type="checkbox" id="active" checked={form.is_active} disabled={isSelf}
                onChange={(e) => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 accent-primary-600"/>
              <label htmlFor="active" className="text-sm text-slate-700 dark:text-slate-300">Active account {isSelf && <span className="text-slate-400">(you cannot deactivate yourself)</span>}</label>
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">{saving ? "Saving..." : creating ? "Create account" : "Save changes"}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function RegistrationModal({ account, onClose, onDone }) {
  const [roles, setRoles] = useState([]);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const approve = async () => {
    if (roles.length === 0) { toast.error("Tick at least one role to approve"); return; }
    setSaving(true);
    try {
      await api.post(`/admin/users/${account.id}/approve`, { roles });
      toast.success(`${account.name} approved`);
      onDone();
    } catch (e) { toast.error(apiErrorText(e, "Approve failed")); }
    finally { setSaving(false); }
  };

  const reject = async () => {
    setSaving(true);
    try {
      await api.post(`/admin/users/${account.id}/reject`, { reason: reason.trim() || null });
      toast.success(`${account.name} rejected`);
      onDone();
    } catch (e) { toast.error(apiErrorText(e, "Reject failed")); }
    finally { setSaving(false); }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="card w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-thin" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900 dark:text-white">Review registration</h3>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X size={16}/></button>
        </div>
        <dl className="grid grid-cols-3 gap-y-1.5 text-sm mb-5">
          <dt className="text-slate-500">Name</dt><dd className="col-span-2 text-slate-900 dark:text-white">{account.name}</dd>
          <dt className="text-slate-500">Email</dt><dd className="col-span-2 text-slate-900 dark:text-white break-all">{account.email}</dd>
          <dt className="text-slate-500">Employee ID</dt><dd className="col-span-2 text-slate-900 dark:text-white">{account.employee_id || "-"}</dd>
          <dt className="text-slate-500">Registered</dt><dd className="col-span-2 text-slate-900 dark:text-white">{account.created_at ? new Date(account.created_at).toLocaleString("en-MY") : "-"}</dd>
        </dl>
        {rejecting ? (
          <div className="space-y-3">
            <label className="label">Reason (optional, shown to the person when they sign in)</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} className="input resize-none" rows={3} maxLength={500}/>
            <div className="flex gap-3">
              <button onClick={() => setRejecting(false)} className="btn-secondary flex-1">Back</button>
              <button onClick={reject} disabled={saving} className="btn-danger flex-1">{saving ? "Rejecting..." : "Reject registration"}</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="label">Roles to grant (at least one)</label>
              <RolePicker value={roles} onChange={setRoles}/>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRejecting(true)} className="btn-secondary flex-1 text-red-600">Reject</button>
              <button onClick={approve} disabled={saving || roles.length === 0} className="btn-primary flex-1">{saving ? "Approving..." : "Approve"}</button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function StaffAccounts() {
  const { user } = useAuth();
  const [staff, setStaff] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [reviewing, setReviewing] = useState(null);

  const fetchAll = () => {
    setLoading(true);
    api.get("/admin/users").then(r => setStaff(r.data))
      .catch(e => toast.error(apiErrorText(e, "Failed to load staff accounts")))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const handleDelete = async (u) => {
    if (!confirm(`Delete ${u.name}? Accounts that own inspections or reports can only be deactivated.`)) return;
    try {
      await api.delete(`/admin/users/${u.id}`);
      toast.success("Account deleted");
      fetchAll();
    } catch (e) { toast.error(apiErrorText(e, "Delete failed")); }
  };

  const q = search.toLowerCase();
  const pending = staff.filter(u => u.status === "pending");
  const filtered = staff.filter(u =>
    u.status !== "pending" &&
    (roleFilter === "all" || (roleFilter === "rejected" ? u.status === "rejected" : u.roles?.includes(roleFilter))) &&
    [u.name, u.email, u.employee_id].some(v => v?.toLowerCase().includes(q))
  );

  return (
    <div className="space-y-6">
      <div className="page-header flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2"><UsersIcon size={22}/> Staff Accounts</h1>
          <p className="page-subtitle">Approve registrations, create accounts, assign roles and deactivate staff. One person can hold several roles.</p>
        </div>
        <motion.button onClick={() => setEditing("new")} className="btn-primary" whileTap={{ scale: 0.97 }}>
          <UserPlus size={16}/> New Account
        </motion.button>
      </div>

      {pending.length > 0 && (
        <div className="card overflow-hidden border-l-4 border-amber-400">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <Clock size={16} className="text-amber-500"/>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Pending approval ({pending.length})</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {pending.map(u => (
              <div key={u.id} className="flex items-center gap-4 px-5 py-3 flex-wrap sm:flex-nowrap">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{u.name}</p>
                  <p className="text-xs text-slate-400 truncate">{u.employee_id ? u.employee_id + " · " : ""}{u.email}</p>
                </div>
                <span className="text-xs text-slate-400">{u.created_at ? new Date(u.created_at).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : ""}</span>
                <button onClick={() => setReviewing(u)} className="btn-primary px-3 py-1.5 text-xs"><UserCheck size={14}/> Review</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="card p-3 flex items-center gap-3 flex-1">
          <Search size={16} className="text-slate-400 shrink-0"/>
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 bg-transparent outline-none text-sm text-slate-700 dark:text-slate-300 placeholder-slate-400" placeholder="Search by name, email or ID…"/>
        </div>
        <div className="card p-1 flex gap-1 flex-wrap">
          {["all", ...ROLE_OPTIONS.map(o => o.value), "rejected"].map(r => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={clsx("px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors", roleFilter === r ? "bg-primary-600 text-white" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800")}>
              {r === "all" ? "All" : r === "rejected" ? "Rejected" : roleLabel(r)}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[...Array(5)].map((_, i) => <div key={i} className="p-4 flex gap-4"><div className="skeleton h-10 w-10 rounded-full"/><div className="flex-1 space-y-2"><div className="skeleton h-4 w-1/3 rounded"/><div className="skeleton h-3 w-1/2 rounded"/></div></div>)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-12">No staff accounts found</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((u) => (
              <div key={u.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex-wrap sm:flex-nowrap">
                <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold text-sm shrink-0">
                  {u.name?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{u.name} {u.id === user?.id && <span className="text-xs text-slate-400">(you)</span>}</p>
                  <p className="text-xs text-slate-400 truncate">{u.employee_id ? u.employee_id + " · " : ""}{u.email}</p>
                  {u.status === "rejected" && <p className="text-xs text-red-500 truncate">Rejected{u.reject_reason ? `: ${u.reject_reason}` : ""}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {u.roles?.length ? u.roles.map(r => <span key={r} className={roleBadge(r)}>{roleLabel(r)}</span>) : <span className="badge-gray">No roles</span>}
                </div>
                {u.status === "rejected"
                  ? <span className="badge-red">Rejected</span>
                  : <span className={u.is_active ? "badge-green" : "badge-gray"}>{u.is_active ? "Active" : "Inactive"}</span>}
                <div className="flex items-center gap-1">
                  {u.status !== "rejected" && <button onClick={() => setEditing(u)} className="btn-ghost p-1.5 rounded-lg" title="Edit"><Pencil size={14}/></button>}
                  {u.id !== user?.id && (
                    <button onClick={() => handleDelete(u)} className="btn-ghost p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete"><Trash2 size={14}/></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {reviewing && (
          <RegistrationModal
            account={reviewing}
            onClose={() => setReviewing(null)}
            onDone={() => { setReviewing(null); fetchAll(); }}
          />
        )}
        {editing && (
          <StaffModal
            staff={editing === "new" ? null : editing}
            isSelf={editing !== "new" && editing.id === user?.id}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); fetchAll(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
