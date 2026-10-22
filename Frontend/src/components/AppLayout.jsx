import { useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Bell, User, Settings, LogOut, X, ClipboardList, ClipboardCheck, FileText, Share2,
  Inbox, ShieldAlert, Files, BarChart3, Users, Building2, LayoutGrid, Hand, Hammer, Scale, HardHat,
} from "lucide-react";
import TopNavBar from "./TopNavBar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { rolesText } from "../utils/roles.js";
import toast from "react-hot-toast";
import clsx from "clsx";
import logo from "../assets/company-logo.png";

const SECTIONS = [
  {
    links: [
      { to: "/",              label: "Home",          icon: Home, end: true },
      { to: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    title: "Inspector",
    role: "inspector",
    links: [
      { to: "/inspections", label: "My Inspections",       icon: ClipboardList },
      { to: "/assigned",    label: "Assigned Inspections", icon: ClipboardCheck },
      { to: "/reports",     label: "My Reports",           icon: FileText },
      { to: "/shared",      label: "Shared with Me",       icon: Share2 },
    ],
  },
  {
    title: "Maintenance",
    role: "maintenance",
    links: [
      { to: "/jobs/board",    label: "Job Board",       icon: LayoutGrid },
      { to: "/jobs/assigned", label: "Assigned Jobs",   icon: ClipboardCheck },
      { to: "/jobs/claimed",  label: "My Claimed Jobs", icon: Hand },
    ],
  },
  {
    title: "Facility Manager",
    role: "facility_manager",
    links: [
      { to: "/complaints",        label: "Complaints",        icon: Inbox },
      { to: "/severity-review",   label: "Severity Review",   icon: ShieldAlert },
      { to: "/repair-assignment", label: "Repair Assignment", icon: Hammer },
      { to: "/repair-review",     label: "Repair Review",     icon: Scale },
      { to: "/maintenance-staff", label: "Staff",             icon: HardHat },
      { to: "/all-reports",       label: "All Reports",       icon: Files },
    ],
  },
  {
    title: "Admin",
    role: "admin",
    links: [
      { to: "/statistics",  label: "Statistics",     icon: BarChart3 },
      { to: "/staff",       label: "Staff Accounts", icon: Users },
      { to: "/buildings",   label: "Buildings",      icon: Building2 },
      { to: "/all-reports", label: "All Reports",    icon: Files },
    ],
  },
  {
    title: "Account",
    links: [
      { to: "/profile",  label: "Profile",  icon: User },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function visibleSections(hasRole) {
  const seen = new Set();
  return SECTIONS
    .filter((s) => !s.role || hasRole(s.role))
    .map((s) => ({
      ...s,
      links: s.links.filter((l) => {
        if (seen.has(l.to)) return false;
        seen.add(l.to);
        return true;
      }),
    }))
    .filter((s) => s.links.length > 0);
}

function Sidebar({ onClose }) {
  const { logout, user, hasRole } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => { await logout(); toast.success("Logged out"); navigate("/login"); };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800">
      <div className="px-5 py-5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <img src={logo} alt="VIDA" className="w-9 h-9 rounded-xl object-contain shadow" />
          <div className="min-w-0">
            <p className="font-bold text-slate-900 dark:text-white text-base leading-tight">VIDA</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest truncate">{rolesText(user?.roles)}</p>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden btn-ghost p-1.5 rounded-lg"><X size={18}/></button>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto scrollbar-thin">
        {visibleSections(hasRole).map((section, i) => (
          <div key={section.title || i} className="space-y-1">
            {section.title && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">{section.title}</p>
            )}
            {section.links.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} onClick={onClose}
                className={({ isActive }) => clsx(isActive ? "sidebar-link-active" : "sidebar-link-inactive")}>
                {({ isActive }) => (
                  <><Icon size={18} className={isActive ? "text-white" : "text-slate-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"}/><span>{label}</span></>
                )}
              </NavLink>
            ))}
          </div>
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

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
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
