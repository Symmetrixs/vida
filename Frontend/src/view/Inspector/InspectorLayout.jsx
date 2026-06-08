import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Home, ClipboardList, Building2, FileText, BarChart2, Share2, User, Settings, LogOut, X, Menu as MenuIcon } from "lucide-react";
import TopNavBar from "../../components/TopNavBar.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import toast from "react-hot-toast";
import clsx from "clsx";
import logo from "../../assets/company-logo.png";

const links = [
  { to: "/inspector",            label: "Home",        icon: Home,          end: true },
  { to: "/inspector/inspections",label: "Inspections", icon: ClipboardList },
  { to: "/inspector/vessels",    label: "Buildings",   icon: Building2 },
  { to: "/inspector/reports",    label: "Reports",     icon: FileText },
  { to: "/inspector/statistics", label: "Statistics",  icon: BarChart2 },
  { to: "/inspector/team-reports",label: "Shared",      icon: Share2 },
  { to: "/inspector/profile",    label: "Profile",     icon: User },
  { to: "/inspector/settings",   label: "Settings",    icon: Settings },
];

function Sidebar({ onClose }) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => { await logout(); toast.success("Logged out"); navigate("/login"); };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800">
      <div className="px-5 py-5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <img src={logo} alt="VIDA" className="w-9 h-9 rounded-xl object-contain shadow" />
          <div>
            <p className="font-bold text-slate-900 dark:text-white text-base leading-tight">VIDA</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">{user?.role?.replace(/_/g, " ") || "Inspector"}</p>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden btn-ghost p-1.5 rounded-lg"><X size={18}/></button>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onClose}
            className={({ isActive }) => clsx(isActive ? "sidebar-link-active" : "sidebar-link-inactive")}>
            {({ isActive }) => (
              <><Icon size={18} className={isActive ? "text-white" : "text-slate-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"}/><span>{label}</span></>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="px-3 py-4 border-t border-slate-100 dark:border-slate-800">
        <button onClick={handleLogout} className="w-full sidebar-link-inactive text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
          <LogOut size={18}/><span>Sign out</span>
        </button>
      </div>
    </div>
  );
}

export default function InspectorLayout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <aside className="hidden lg:flex flex-col w-60 shrink-0 h-screen sticky top-0">
        <Sidebar onClose={() => {}} />
      </aside>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}/>
            <motion.aside className="fixed inset-y-0 left-0 z-50 w-72 lg:hidden shadow-2xl" initial={{ x: -288 }} animate={{ x: 0 }} exit={{ x: -288 }} transition={{ type: "spring", damping: 28, stiffness: 300 }}>
              <Sidebar onClose={() => setOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNavBar onMenuToggle={() => setOpen(true)} />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <motion.div key={location.pathname} className="p-6 max-w-screen-xl mx-auto" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}