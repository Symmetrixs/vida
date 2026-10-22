import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, CalendarClock, User, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { JOB_STATUS_LABEL, JOB_STATUS_CLASS, REWORK_CLASS } from "../utils/repairUi.js";
import { SEVERITY_CLASS, fmtDay } from "../utils/complaintUi.js";

export function JobNumbers({ job, large = false }) {
  const refs = [job.reference, job.inspection_reference, job.complaint_reference].filter(Boolean);
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      {refs.map((r, i) => (
        <span key={r} className={clsx("font-mono", i === 0 ? clsx("font-semibold text-slate-900 dark:text-white", large ? "text-2xl" : "text-sm") : "text-xs text-slate-500 dark:text-slate-400")}>
          {r}
        </span>
      ))}
    </span>
  );
}

export function JobDue({ job }) {
  if (job.is_overdue) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
        <AlertTriangle size={11}/> Overdue by {job.days_overdue} day{job.days_overdue > 1 ? "s" : ""}
      </span>
    );
  }
  if (job.due_date && job.status === "in_progress") {
    return <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400"><CalendarClock size={11}/> Due {fmtDay(job.due_date)}</span>;
  }
  return null;
}

export function JobBadges({ job }) {
  return (
    <>
      <span className={JOB_STATUS_CLASS[job.status]}>{JOB_STATUS_LABEL[job.status]}</span>
      {job.inspection?.severity && <span className={SEVERITY_CLASS[job.inspection.severity]}>{job.inspection.severity}</span>}
      {job.is_rework && job.status !== "done" && <span className={REWORK_CLASS}>Rework{job.rework_count > 1 ? ` x${job.rework_count}` : ""}</span>}
      <JobDue job={job}/>
    </>
  );
}

export function JobRow({ job, index = 0, showWorker = false }) {
  const inspection = job.inspection || {};
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.03 }}>
      <Link to={`/jobs/${job.id}`}
        className={clsx("px-5 py-4 flex items-center gap-3 border-l-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors", job.is_overdue ? "border-red-500 bg-red-50/60 dark:bg-red-900/10" : "border-transparent")}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <JobNumbers job={job}/>
            <JobBadges job={job}/>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300 mt-1 truncate">{inspection.title}</p>
          <p className="text-xs text-slate-400 truncate">{[inspection.buildings?.name, inspection.floor_level, inspection.area_inspected].filter(Boolean).join(" · ")}</p>
        </div>
        {showWorker && job.worker_name && <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0"><User size={12}/> {job.worker_name}</span>}
        <ChevronRight size={16} className="text-slate-300 shrink-0"/>
      </Link>
    </motion.div>
  );
}

export function ListShell({ loading, empty, icon: Icon, children }) {
  return (
    <div className="card overflow-hidden">
      {loading ? (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {[...Array(3)].map((_, i) => <div key={i} className="p-4 space-y-2"><div className="skeleton h-4 w-1/4 rounded"/><div className="skeleton h-3 w-2/3 rounded"/></div>)}
        </div>
      ) : empty ? (
        <div className="p-12 text-center">
          <Icon size={40} className="text-slate-300 dark:text-slate-700 mx-auto mb-3"/>
          <p className="text-slate-400">{empty}</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">{children}</div>
      )}
    </div>
  );
}
