import { useState, useEffect } from "react";
import { HardHat, ClipboardList, Users } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { apiErrorText } from "../../utils/apiError.js";
import clsx from "clsx";

const INSPECTOR_COLUMNS = [
  { key: "assigned",          label: "Assigned" },
  { key: "in_progress",       label: "In progress" },
  { key: "awaiting_severity", label: "Awaiting severity" },
  { key: "overdue",           label: "Overdue" },
  { key: "done",              label: "Done" },
];

const MAINTENANCE_COLUMNS = [
  { key: "assigned",        label: "Assigned" },
  { key: "claimed",         label: "Claimed" },
  { key: "awaiting_review", label: "Awaiting review" },
  { key: "overdue",         label: "Overdue" },
  { key: "done",            label: "Done" },
];

const leastBusyFirst = (rows) => [...rows].sort((a, b) => a.active - b.active || a.name.localeCompare(b.name));

function StaffTable({ title, icon: Icon, rows, columns, loading, empty, note }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Icon size={17}/> {title}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">{note}</p>
      </div>
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-8 w-full rounded"/>)}</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center"><Icon size={36} className="text-slate-300 dark:text-slate-700 mx-auto mb-3"/><p className="text-slate-400">{empty}</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 px-5">Name</th>
                {columns.map(c => <th key={c.key} className="py-3 px-3 text-right">{c.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map(w => (
                <tr key={w.id}>
                  <td className="py-3 px-5">
                    <p className="font-medium text-slate-900 dark:text-white">{w.name}</p>
                    <p className="text-xs text-slate-400">{w.email}</p>
                  </td>
                  {columns.map(c => (
                    <td key={c.key} className={clsx("py-3 px-3 text-right", c.key === "overdue" && w.overdue > 0 ? "text-red-600 font-semibold" : "text-slate-700 dark:text-slate-300")}>{w[c.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export default function MaintenanceStaff() {
  const [inspectors, setInspectors] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/inspections/staff").then(r => setInspectors(leastBusyFirst(r.data))).catch(e => toast.error(apiErrorText(e, "Failed to load inspectors"))),
      api.get("/repairs/staff").then(r => setWorkers(leastBusyFirst(r.data))).catch(e => toast.error(apiErrorText(e, "Failed to load maintenance staff"))),
    ]).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><Users size={22}/> Staff</h1>
        <p className="page-subtitle">Active inspectors and maintenance workers with their current work, least busy first. Accounts are managed by an admin.</p>
      </div>
      <StaffTable
        title="Inspectors"
        icon={ClipboardList}
        rows={inspectors}
        columns={INSPECTOR_COLUMNS}
        loading={loading}
        empty="No active inspectors"
        note="Assigned means a complaint task not started yet. In progress counts drafts being worked on. Least busy is fewest assigned plus in progress."
      />
      <StaffTable
        title="Maintenance"
        icon={HardHat}
        rows={workers}
        columns={MAINTENANCE_COLUMNS}
        loading={loading}
        empty="No active maintenance staff"
        note="Repair jobs assigned to or claimed by each worker."
      />
    </div>
  );
}
