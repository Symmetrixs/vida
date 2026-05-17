import { useAuth } from "../../context/AuthContext.jsx";
import { motion } from "framer-motion";
import { Settings as SettingsIcon, Sun, Moon, User } from "lucide-react";

export default function Settings() {
  const { user, theme, toggleTheme } = useAuth();
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><SettingsIcon size={22}/> Settings</h1>
        <p className="page-subtitle">Manage your account and application preferences</p>
      </div>

      <motion.div className="card p-6" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2"><User size={16}/> Account</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-sm text-slate-600 dark:text-slate-400">Name</span>
            <span className="text-sm font-medium text-slate-900 dark:text-white">{user?.name}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-sm text-slate-600 dark:text-slate-400">Email</span>
            <span className="text-sm font-medium text-slate-900 dark:text-white">{user?.email}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-sm text-slate-600 dark:text-slate-400">Role</span>
            <span className="badge-blue capitalize">{user?.role?.replace("_", " ")}</span>
          </div>
        </div>
      </motion.div>

      <motion.div className="card p-6" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">Appearance</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Theme</p>
            <p className="text-xs text-slate-400 mt-0.5">Switch between light and dark mode</p>
          </div>
          <button onClick={toggleTheme} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            {theme === "dark" ? <Sun size={16}/> : <Moon size={16}/>}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
