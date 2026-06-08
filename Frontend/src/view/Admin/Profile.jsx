import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { User, Save, Camera, Lock, Eye, EyeOff, BadgeCheck, Loader2, Phone, Building2, IdCard } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext.jsx";

const ROLE_COLOR = {
  inspector:        "badge-blue",
  facility_manager: "badge-amber",
  admin:            "badge-red",
};

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [form,       setForm]      = useState({
    name:        user?.name        || "",
    phone:       user?.phone       || "",
    department:  user?.department  || "",
    employee_id: user?.employee_id || "",
  });
  const [saving,      setSaving]      = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url || null);
  const [pwForm,      setPwForm]      = useState({ current: "", next: "", confirm: "" });
  const [pwLoading,   setPwLoading]   = useState(false);
  const [showPw,      setShowPw]      = useState({ current: false, next: false, confirm: false });
  const fileRef = useRef(null);

  const set    = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setPw  = (k, v) => setPwForm(f => ({ ...f, [k]: v }));

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    setAvatarPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/inspector/avatar", fd, { headers: { "Content-Type": "multipart/form-data" } });
      updateUser({ avatar_url: r.data.avatar_url });
      toast.success("Avatar updated");
    } catch { toast.error("Avatar upload failed"); setAvatarPreview(user?.avatar_url || null); }
    finally { setUploading(false); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.put("/inspector/profile", form);
      updateUser(r.data);
      toast.success("Profile updated");
    } catch { toast.error("Update failed"); }
    finally { setSaving(false); }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) { toast.error("New passwords do not match"); return; }
    if (pwForm.next.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setPwLoading(true);
    try {
      await api.post("/auth/change-password", { current_password: pwForm.current, new_password: pwForm.next });
      toast.success("Password changed successfully");
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Password change failed");
    } finally { setPwLoading(false); }
  };

  const initials = (user?.name || "U").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><User size={22}/> My Profile</h1>
        <p className="page-subtitle">Manage your account information and security</p>
      </div>

      <motion.div className="card p-6 space-y-6" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-5 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div className="relative shrink-0">
            <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-lg bg-gradient-to-br from-primary-600 to-vida-accent flex items-center justify-center">
              {avatarPreview ? (
                <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover"/>
              ) : (
                <span className="text-white text-3xl font-black">{initials}</span>
              )}
              {uploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-2xl">
                  <Loader2 size={20} className="text-white animate-spin"/>
                </div>
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              title="Change avatar"
            >
              <Camera size={14} className="text-slate-600 dark:text-slate-300"/>
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange}/>
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 dark:text-white text-xl truncate">{user?.name}</h3>
            <p className="text-sm text-slate-400 truncate">{user?.email}</p>
            {user?.employee_id && (
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                <IdCard size={11}/> {user.employee_id}
              </p>
            )}
            <span className={"mt-1.5 inline-block capitalize " + (ROLE_COLOR[user?.role] || "badge-gray")}>
              {user?.role?.replace("_", " ")}
            </span>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <BadgeCheck size={15} className="text-primary-600"/> Personal Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Full Name</label>
              <input value={form.name} onChange={e => set("name", e.target.value)} className="input" placeholder="Your full name" required/>
            </div>
            <div>
              <label className="label">Matric No. / Employee ID</label>
              <div className="relative">
                <IdCard size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input value={form.employee_id} onChange={e => set("employee_id", e.target.value)} className="input pl-8" placeholder="e.g. B032410881 or EMP-001"/>
              </div>
            </div>
            <div>
              <label className="label">Phone Number</label>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input value={form.phone} onChange={e => set("phone", e.target.value)} className="input pl-8" placeholder="+60 12-345 6789"/>
              </div>
            </div>
            <div>
              <label className="label">Department / Faculty</label>
              <div className="relative">
                <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input value={form.department} onChange={e => set("department", e.target.value)} className="input pl-8" placeholder="e.g. FTMK"/>
              </div>
            </div>
          </div>
          <div className="pt-2 flex justify-end">
            <motion.button type="submit" disabled={saving} className="btn-primary flex items-center gap-2" whileTap={{ scale: 0.97 }}>
              {saving ? <><Loader2 size={14} className="animate-spin"/> Saving…</> : <><Save size={14}/> Save Profile</>}
            </motion.button>
          </div>
        </form>
      </motion.div>

      <motion.div className="card p-6 space-y-4" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Lock size={15} className="text-amber-600"/> Change Password
        </h3>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          {[
            { key: "current",  label: "Current Password",     placeholder: "Enter current password"  },
            { key: "next",     label: "New Password",          placeholder: "Min. 8 characters"       },
            { key: "confirm",  label: "Confirm New Password",  placeholder: "Repeat new password"     },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="label">{label}</label>
              <div className="relative">
                <input
                  type={showPw[key] ? "text" : "password"}
                  value={pwForm[key]}
                  onChange={e => setPw(key, e.target.value)}
                  className="input pr-10"
                  placeholder={placeholder}
                  required
                />
                <button type="button" onClick={() => setShowPw(p => ({ ...p, [key]: !p[key] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  {showPw[key] ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
            </div>
          ))}
          <div className="pt-1 flex justify-end">
            <motion.button type="submit" disabled={pwLoading} className="btn-secondary flex items-center gap-2" whileTap={{ scale: 0.97 }}>
              {pwLoading ? <><Loader2 size={14} className="animate-spin"/> Changing…</> : <><Lock size={14}/> Change Password</>}
            </motion.button>
          </div>
        </form>
      </motion.div>

      <motion.div className="card p-4" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
            <User size={14} className="text-slate-500"/>
          </div>
          <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
            <p><span className="font-semibold text-slate-700 dark:text-slate-300">Email:</span> {user?.email}</p>
            <p><span className="font-semibold text-slate-700 dark:text-slate-300">Role:</span> {user?.role?.replace("_", " ")}</p>
            <p><span className="font-semibold text-slate-700 dark:text-slate-300">Account created:</span> {user?.created_at ? new Date(user.created_at).toLocaleDateString("en-MY", { year: "numeric", month: "long", day: "numeric" }) : "—"}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}