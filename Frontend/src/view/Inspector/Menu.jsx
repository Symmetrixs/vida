import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ClipboardList, Building2, FileText, BarChart2, Share2, User, Settings, Plus } from "lucide-react";

const items = [
  { to: "/inspector/inspections/new/part1", icon: Plus,          label: "New Inspection",  desc: "Start a new building check",       color: "bg-primary-600" },
  { to: "/inspector/inspections",           icon: ClipboardList, label: "Inspections",     desc: "View all your inspections",         color: "bg-vida-accent" },
  { to: "/inspector/vessels",               icon: Building2,     label: "Buildings",       desc: "Browse campus buildings",           color: "bg-violet-600" },
  { to: "/inspector/reports",               icon: FileText,      label: "Reports",         desc: "Generate and manage reports",       color: "bg-amber-500" },
  { to: "/inspector/statistics",            icon: BarChart2,     label: "Statistics",      desc: "View your performance stats",       color: "bg-green-600" },
  { to: "/inspector/team-reports",          icon: Share2,        label: "Shared Reports",    desc: "Reports shared with you",              color: "bg-rose-500" },
  { to: "/inspector/profile",               icon: User,          label: "Profile",         desc: "Update your personal info",         color: "bg-slate-600" },
  { to: "/inspector/settings",              icon: Settings,      label: "Settings",        desc: "App preferences & password",        color: "bg-indigo-600" },
];

export default function Menu() {
  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Menu</h1>
        <p className="page-subtitle">All VIDA features at a glance</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(({ to, icon: Icon, label, desc, color }, i) => (
          <motion.div key={to} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Link to={to} className="card-hover p-5 flex items-center gap-4 group">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${color}`}>
                <Icon size={22} className="text-white"/>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">{label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}