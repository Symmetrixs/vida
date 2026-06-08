import { useAuth } from "../../context/AuthContext.jsx";
import { motion } from "framer-motion";
import { Settings, Sun, Moon, Lock, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function InspectorSettings() {
  const { theme, toggleTheme } = useAuth();

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

      <motion.div className="card p-6" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-2">
          <Lock size={16}/> Password & Security
        </h3>
        <p className="text-sm text-slate-400 mb-4">Change your password and manage account security from your Profile page.</p>
        <Link to="/inspector/profile" className="btn-secondary inline-flex items-center gap-2 text-sm">
          Go to Profile <ArrowRight size={14}/>
        </Link>
      </motion.div>
    </div>
  );
}