import { useState } from "react";
import { motion } from "framer-motion";
import { User, Save, Camera } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext.jsx";

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({ name: user?.name || "", phone: user?.phone || "", department: user?.department || "" });
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({...f, [k]: v}));

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.put("/inspector/profile", form);
      updateUser(r.data);
      toast.success("Profile updated");
    } catch { toast.error("Update failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><User size={22}/> My Profile</h1>
        <p className="page-subtitle">Update your personal information</p>
      </div>

      <motion.div className="card p-6" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-5 mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-600 to-vida-accent flex items-center justify-center text-white text-3xl font-black shadow-lg">
              {user?.name?.[0]?.toUpperCase() || "U"}
            </div>
            <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm hover:bg-slate-50 transition-colors">
              <Camera size={13} className="text-slate-500"/>
            </button>
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg">{user?.name}</h3>
            <p className="text-sm text-slate-400">{user?.email}</p>
            <span className="badge-blue mt-1 inline-block capitalize">{user?.role?.replace("_"," ")}</span>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <div><label className="label">Full Name</label><input value={form.name} onChange={e => set("name", e.target.value)} className="input" placeholder="Your full name"/></div>
          <div><label className="label">Phone Number</label><input value={form.phone} onChange={e => set("phone", e.target.value)} className="input" placeholder="+60 12-345 6789"/></div>
          <div><label className="label">Department</label><input value={form.department} onChange={e => set("department", e.target.value)} className="input" placeholder="e.g. Faculty of ICT"/></div>
          <div className="pt-2 flex justify-end">
            <motion.button type="submit" disabled={loading} className="btn-primary" whileTap={{ scale: 0.97 }}>
              {loading ? "Saving…" : <span className="flex items-center gap-2"><Save size={15}/> Save Profile</span>}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
