import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ClipboardList, Building2, FileText, Plus, ArrowRight, AlertTriangle, CheckCircle, Clock, Inbox, CalendarClock } from "lucide-react";
import api from "../../api/axios.js";
import { useAuth } from "../../context/AuthContext.jsx";

const QuickCard = ({ to, icon: Icon, label, color, delay }) => (
  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
    <Link to={to} className="card-hover p-5 flex flex-col gap-3 group">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={20} className="text-white"/>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{label}</span>
        <ArrowRight size={15} className="text-slate-300 group-hover:text-primary-600 group-hover:translate-x-1 transition-all"/>
      </div>
    </Link>
  </motion.div>
);

const TASK_BADGE = { assigned: "badge-gray", in_progress: "badge-blue", resolved: "badge-green" };
const TASK_LABEL = { assigned: "assigned", in_progress: "in progress", resolved: "resolved" };
const fmtDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-MY", { dateStyle: "medium" });

function TaskDue({ task }) {
  if (task.is_overdue) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
        <AlertTriangle size={11}/> Overdue by {task.days_overdue} day{task.days_overdue > 1 ? "s" : ""}
      </span>
    );
  }
  if (task.resolved_late) return <span className="text-[11px] font-medium text-red-600 dark:text-red-400">Resolved late</span>;
  if (task.due_date && task.status !== "resolved") {
    return <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400"><CalendarClock size={11}/> Due {fmtDay(task.due_date)}</span>;
  }
  if (!task.due_date && task.status !== "resolved") return <span className="text-[11px] text-slate-400">No due date</span>;
  return null;
}

export default function Home() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [stats, setStats] = useState(null);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    Promise.all([api.get("/inspector/dashboard"), api.get("/inspector/stats")])
      .then(([d, s]) => { setDashboard(d.data); setStats(s.data); })
      .catch(() => {});
    api.get("/inspector/assigned-tasks").then(r => setTasks(r.data)).catch(() => {});
  }, []);

  const openTasks = tasks.filter(t => t.status !== "resolved").length;

  const statusIcon = (s) => ({ completed: <CheckCircle size={14} className="text-green-500"/>, submitted: <Clock size={14} className="text-blue-500"/>, draft: <AlertTriangle size={14} className="text-amber-500"/> }[s] || null);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Hello, {user?.name?.split(" ")[0]}</h1>
        <p className="page-subtitle">Manage your building inspections for UTeM campus</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <div className="stat-card col-span-1"><div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center"><ClipboardList size={18} className="text-white"/></div><div><p className="text-xl font-bold text-slate-900 dark:text-white">{stats?.total_inspections ?? "—"}</p><p className="text-xs text-slate-400">Total Inspections</p></div></div>
        <div className="stat-card col-span-1"><div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center"><AlertTriangle size={18} className="text-white"/></div><div><p className="text-xl font-bold text-slate-900 dark:text-white">{stats?.total_findings ?? "—"}</p><p className="text-xs text-slate-400">Findings</p></div></div>
        <div className="stat-card col-span-1"><div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center"><CheckCircle size={18} className="text-white"/></div><div><p className="text-xl font-bold text-slate-900 dark:text-white">{stats?.inspections_by_status?.completed ?? 0}</p><p className="text-xs text-slate-400">Completed</p></div></div>
        <div className="stat-card col-span-1"><div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center"><Clock size={18} className="text-white"/></div><div><p className="text-xl font-bold text-slate-900 dark:text-white">{stats?.inspections_by_status?.draft ?? 0}</p><p className="text-xs text-slate-400">In Progress</p></div></div>
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <QuickCard to="/inspector/inspections/new/part1" icon={Plus}          label="New Inspection"  color="bg-primary-600"  delay={0}    />
          <QuickCard to="/inspector/inspections"           icon={ClipboardList} label="My Inspections"  color="bg-vida-accent"  delay={0.05} />
          <QuickCard to="/inspector/vessels"               icon={Building2}     label="Buildings"       color="bg-violet-600"   delay={0.1}  />
          <QuickCard to="/inspector/reports"               icon={FileText}      label="Reports"         color="bg-amber-500"    delay={0.15} />
        </div>
      </div>

      {tasks.length > 0 && (
        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2"><Inbox size={17} className="text-primary-600"/> Assigned tasks</h3>
            <span className="text-xs text-slate-400">{openTasks} open</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {tasks.map(task => (
              <div key={task.reference} className={`py-3 flex items-center gap-3 ${task.is_overdue ? "border-l-4 border-red-500 pl-3 -ml-1" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-200">{task.reference}</span>
                    <span className={TASK_BADGE[task.status]}>{TASK_LABEL[task.status]}</span>
                    <TaskDue task={task}/>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{task.building?.name} · {task.floor} · {task.location_note}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{task.description}</p>
                </div>
                {task.inspection_id && (
                  <Link to={`/inspector/inspections/${task.inspection_id}/photo`} className="btn-secondary text-xs shrink-0">Open</Link>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Recent Inspections</h3>
          <Link to="/inspector/inspections" className="text-xs text-primary-600 dark:text-primary-400 hover:underline">View all</Link>
        </div>
        {!dashboard?.recent_inspections?.length ? (
          <div className="text-center py-8">
            <ClipboardList size={32} className="text-slate-300 dark:text-slate-700 mx-auto mb-2"/>
            <p className="text-sm text-slate-400">No inspections yet</p>
            <Link to="/inspector/inspections/new/part1" className="btn-primary mt-3 inline-flex text-xs">Start first inspection</Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {dashboard.recent_inspections.map(insp => (
              <div key={insp.id} className="py-3 flex items-center gap-3">
                {statusIcon(insp.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{insp.title}</p>
                  <p className="text-xs text-slate-400">{insp.buildings?.name} · {new Date(insp.created_at).toLocaleDateString("en-MY")}</p>
                </div>
                <span className={{"draft":"badge-gray","submitted":"badge-blue","completed":"badge-green"}[insp.status]||"badge-gray"}>{insp.status}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
