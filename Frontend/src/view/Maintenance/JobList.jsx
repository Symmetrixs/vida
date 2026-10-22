import { useState, useEffect } from "react";
import { LayoutGrid, ClipboardCheck, Hand } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { apiErrorText } from "../../utils/apiError.js";
import clsx from "clsx";
import { JobRow, ListShell } from "../../components/RepairParts.jsx";

const MODES = {
  board: {
    icon: LayoutGrid,
    title: "Job Board",
    subtitle: "Open repair jobs nobody has taken yet. Open one to see the inspection report and claim it.",
    url: "/repairs/board",
    empty: "No open jobs on the board",
  },
  assigned: {
    icon: ClipboardCheck,
    title: "Assigned Jobs",
    subtitle: "Repair jobs a facility manager assigned to you.",
    url: "/repairs/mine?type=assigned",
    empty: "Nothing is assigned to you",
  },
  claimed: {
    icon: Hand,
    title: "My Claimed Jobs",
    subtitle: "Repair jobs you claimed from the Job Board.",
    url: "/repairs/mine?type=claimed",
    empty: "You have not claimed any jobs",
  },
};

const ACTIVE = ["in_progress", "awaiting_review"];

const sortJobs = (a, b) => {
  if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
  if (a.status !== b.status) return a.status === "in_progress" ? -1 : 1;
  if (!a.due_date !== !b.due_date) return a.due_date ? -1 : 1;
  if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
  return 0;
};

export default function JobList({ mode }) {
  const config = MODES[mode];
  const Icon = config.icon;
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("active");

  useEffect(() => {
    setLoading(true);
    api.get(config.url)
      .then(r => setJobs(r.data))
      .catch(e => toast.error(apiErrorText(e, "Failed to load jobs")))
      .finally(() => setLoading(false));
  }, [config.url]);

  const board = mode === "board";
  const active = jobs.filter(j => ACTIVE.includes(j.status)).sort(sortJobs);
  const done = jobs.filter(j => j.status === "done");
  const visible = board ? jobs : tab === "active" ? active : done;

  return (
    <div className="space-y-6">
      <div className="page-header flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2"><Icon size={22}/> {config.title}</h1>
          <p className="page-subtitle">{config.subtitle}</p>
        </div>
        <span className="badge-blue text-sm px-3 py-1.5">{board ? jobs.length : active.length} open</span>
      </div>

      {!board && (
        <div className="flex gap-2">
          {[{ key: "active", label: "Active", count: active.length }, { key: "done", label: "Completed", count: done.length }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={clsx("px-4 py-2 rounded-xl text-sm font-medium transition-colors", tab === t.key ? "bg-primary-600 text-white" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800")}>
              {t.label} <span className="opacity-75">({t.count})</span>
            </button>
          ))}
        </div>
      )}

      <ListShell loading={loading} empty={visible.length === 0 && (board || tab === "active" ? config.empty : "No completed jobs yet")} icon={Icon}>
        {visible.map((job, i) => <JobRow key={job.id} job={job} index={i}/>)}
      </ListShell>
    </div>
  );
}
