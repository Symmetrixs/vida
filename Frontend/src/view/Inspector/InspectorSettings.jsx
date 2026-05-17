import { useAuth } from "../../context/AuthContext.jsx";
import { motion } from "framer-motion";
import { useState } from "react";
import { Settings, Sun, Moon, Lock } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

export default function InspectorSettings() {
  const { user, theme, toggleTheme } = useAuth();
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [loading, setLoading] = useState(false);

  const handlePwChange = async (e) => {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.confirm) { toast.error("Passwords do not match"); return; }
    if (pwForm.new_password.length < 6) { toast.error("Min. 6 characters"); return; }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token: "change", new_password: pwForm.new_password });
      toast.success("Password changed");
      setPwForm({ current_password: "", new_password: "", confirm: "" });
    } catch { toast.error("Failed to change password"); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><Settings size={22}/> Settings</h1>
        <p className="page-subtitle">Manage your preferences</p>
      </div>

      <motion.div className="card p-6" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">Appearance</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Theme</p>
            <p className="text-xs text-slate-400 mt-0.5">Currently: {theme === "dark" ? "Dark" : "Light"} mode</p>
          </div>
          <button onClick={toggleTheme} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            {theme === "dark" ? <><Sun size={16}/> Light mode</> : <><Moon size={16}/> Dark mode</>}
          </button>
        </div>
      </motion.div>

      <motion.div className="card p-6" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2"><Lock size={16}/> Change Password</h3>
        <form onSubmit={handlePwChange} className="space-y-4">
          <div><label className="label">New Password</label><input type="password" value={pwForm.new_password} onChange={e => setPwForm(f => ({...f, new_password: e.target.value}))} className="input" placeholder="Min. 6 characters" required/></div>
          <div><label className="label">Confirm Password</label><input type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({...f, confirm: e.target.value}))} className="input" placeholder="Re-enter password" required/></div>
          <div className="flex justify-end pt-2">
            <motion.button type="submit" disabled={loading} className="btn-primary" whileTap={{ scale: 0.97 }}>{loading ? "Changing…" : "Change Password"}</motion.button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
