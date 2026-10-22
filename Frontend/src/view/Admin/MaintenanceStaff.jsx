import { useState, useEffect } from "react";
import { HardHat } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { apiErrorText } from "../../utils/apiError.js";
import clsx from "clsx";

const COLUMNS = [
  { key: "assigned",        label: "Assigned" },
  { key: "claimed",         label: "Claimed" },
  { key: "awaiting_review", label: "Awaiting review" },
  { key: "overdue",         label: "Overdue" },
  { key: "done",            label: "Done" },
];

export default function MaintenanceStaff() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/repairs/staff")
      .then(r => setStaff([...r.data].sort((a, b) => a.active - b.active || a.name.localeCompare(b.name))))
      .catch(e => toast.error(apiErrorText(e, "Failed to load maintenance staff")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><HardHat size={22}/> Maintenance Staff</h1>
        <p className="page-subtitle">Active maintenance workers and their current repair jobs, least busy first. Accounts are managed by an admin.</p>
      </div>
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-8 w-full rounded"/>)}</div>
        ) : staff.length === 0 ? (
          <div className="p-12 text-center"><HardHat size={40} className="text-slate-300 dark:text-slate-700 mx-auto mb-3"/><p className="text-slate-400">No active maintenance staff</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 px-5">Worker</th>
                {COLUMNS.map(c => <th key={c.key} className="py-3 px-3 text-right">{c.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {staff.map(w => (
                <tr key={w.id}>
                  <td className="py-3 px-5">
                    <p className="font-medium text-slate-900 dark:text-white">{w.name}</p>
                    <p className="text-xs text-slate-400">{w.email}</p>
                  </td>
                  {COLUMNS.map(c => (
                    <td key={c.key} className={clsx("py-3 px-3 text-right", c.key === "overdue" && w.overdue > 0 ? "text-red-600 font-semibold" : "text-slate-700 dark:text-slate-300")}>{w[c.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
