import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, CalendarClock, ClipboardCheck } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { apiErrorText } from "../../utils/apiError.js";
import { OPEN_STATUSES, STATUS_LABEL, STATUS_CLASS, SEVERITY_CLASS, fmtDay } from "../../utils/complaintUi.js";

function TaskDue({ task }) {
  const open = OPEN_STATUSES.includes(task.status);
  if (task.is_overdue) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
        <AlertTriangle size={11}/> Overdue by {task.days_overdue} day{task.days_overdue > 1 ? "s" : ""}
      </span>
    );
  }
  if (task.submitted_late) return <span className="text-[11px] font-medium text-red-600 dark:text-red-400">Submitted late</span>;
  if (task.due_date && open) {
    return <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400"><CalendarClock size={11}/> Due {fmtDay(task.due_date)}</span>;
  }
  if (!task.due_date && open) return <span className="text-[11px] text-slate-400">No due date</span>;
  return null;
}

export default function AssignedInspections() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/inspector/assigned-tasks")
      .then(r => setTasks(r.data))
      .catch(e => toast.error(apiErrorText(e, "Failed to load assigned inspections")))
      .finally(() => setLoading(false));
  }, []);

  const openCount = tasks.filter(t => OPEN_STATUSES.includes(t.status)).length;

  return (
    <div className="space-y-6">
      <div className="page-header flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2"><ClipboardCheck size={22}/> Assigned Inspections</h1>
          <p className="page-subtitle">Public complaints a facility manager assigned to you. Submitted work stays here for 7 days.</p>
        </div>
        <span className="badge-blue text-sm px-3 py-1.5">{openCount} open</span>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[...Array(3)].map((_, i) => <div key={i} className="p-4 space-y-2"><div className="skeleton h-4 w-1/4 rounded"/><div className="skeleton h-3 w-2/3 rounded"/></div>)}
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardCheck size={40} className="text-slate-300 dark:text-slate-700 mx-auto mb-3"/>
            <p className="text-slate-400">Nothing is assigned to you right now</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {tasks.map((task, i) => (
              <motion.div key={task.reference} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                className={`px-5 py-4 flex items-center gap-3 border-l-4 ${task.is_overdue ? "border-red-500 bg-red-50/60 dark:bg-red-900/10" : "border-transparent"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-200">{task.reference}</span>
                    <span className={STATUS_CLASS[task.status]}>{STATUS_LABEL[task.status]}</span>
                    {task.severity && <span className={SEVERITY_CLASS[task.severity]}>{task.severity}</span>}
                    <TaskDue task={task}/>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{task.building?.name} · {task.floor} · {task.location_note}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{task.description}</p>
                </div>
                {task.inspection_id && (
                  <Link to={`/inspections/${task.inspection_id}/edit`} className="btn-secondary text-xs shrink-0">Open</Link>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
