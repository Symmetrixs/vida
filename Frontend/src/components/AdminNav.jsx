import { NavLink, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Users, Building2, FileText,
  BarChart3, Bell, Settings, LogOut, X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import toast from "react-hot-toast";
import clsx from "clsx";

const links = [
  { to: "/admin",              label: "Dashboard",     icon: LayoutDashboard, end: true },
  { to: "/admin/users",        label: "Users",         icon: Users },
  { to: "/admin/vessels",      label: "Buildings",     icon: Building2 },
  { to: "/admin/reports",      label: "Reports",       icon: FileText },
  { to: "/admin/analytics",    label: "Analytics",     icon: BarChart3 },
  { to: "/admin/notifications",label: "Notifications", icon: Bell },
  { to: "/admin/settings",     label: "Settings",      icon: Settings },
];

export default function AdminNav({ open, onClose }) {
  const { logout } = useAuth();
  const navigate   = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out");
    navigate("/login");
  };

  const sidebar = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800">
      <div className="px-5 py-5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-600 to-vida-accent flex items-center justify-center shadow">
            <span className="text-white font-black text-lg leading-none">V</span>
          </div>
          <div>
            <p className="font-bold text-slate-900 dark:text-white text-base leading-tight">VIDA</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Admin Panel</p>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden btn-ghost p-1.5 rounded-lg">
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              clsx(isActive ? "sidebar-link-active" : "sidebar-link-inactive")
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} className={isActive ? "text-white" : "text-slate-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-slate-100 dark:border-slate-800">
        <button
          onClick={handleLogout}
          className="w-full sidebar-link-inactive text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <LogOut size={18} />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex flex-col w-60 shrink-0 h-screen sticky top-0">
        {sidebar}
      </aside>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-72 lg:hidden shadow-2xl"
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
            >
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
