import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ShieldAlert, User, Image as ImageIcon, ChevronRight } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { apiErrorText } from "../../utils/apiError.js";
import clsx from "clsx";
import { ListShell } from "../../components/RepairParts.jsx";
import { SEVERITY_CLASS, fmtDateTime } from "../../utils/complaintUi.js";

const TABS = [
  { key: "pending",  label: "Awaiting review" },
  { key: "reviewed", label: "Reviewed" },
];

export default function SeverityReview() {
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState("pending");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/inspections/review-queue")
      .then(r => setRows(r.data))
      .catch(e => toast.error(apiErrorText(e, "Failed to load inspections")))
      .finally(() => setLoading(false));
  }, []);

  const pending = rows.filter(r => !r.reviewed);
  const reviewed = rows.filter(r => r.reviewed).sort((a, b) => (a.assessed_at < b.assessed_at ? 1 : -1));
  const visible = tab === "pending" ? pending : reviewed;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><ShieldAlert size={22}/> Severity Review</h1>
        <p className="page-subtitle">Every submitted inspection, from public complaints and inspectors' own work. Set one overall severity for each and it is sent to the admins. Reviewed inspections can become repair jobs.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={clsx("px-4 py-2 rounded-xl text-sm font-medium transition-colors", tab === t.key ? "bg-primary-600 text-white" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800")}>
            {t.label} <span className="opacity-75">({(t.key === "pending" ? pending : reviewed).length})</span>
          </button>
        ))}
      </div>

      <ListShell loading={loading} empty={visible.length === 0 && (tab === "pending" ? "No inspections are waiting for review" : "No reviewed inspections yet")} icon={ShieldAlert}>
        {visible.map((r, i) => (
          <motion.div key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
            <Link to={`/inspections/${r.id}/review`} className="px-5 py-4 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{r.reference}</span>
                  {r.complaint_reference && <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{r.complaint_reference}</span>}
                  {r.severity && <span className={SEVERITY_CLASS[r.severity]}>{r.severity}</span>}
                  {r.repair_job && <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{r.repair_job.reference}</span>}
                  <span className="text-xs text-slate-400">{r.reviewed ? `Reviewed ${fmtDateTime(r.assessed_at)}${r.assessor ? ` by ${r.assessor}` : ""}` : `Submitted ${fmtDateTime(r.submitted_at)}`}</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 mt-1 truncate">{r.title}</p>
                <p className="text-xs text-slate-400 truncate">{[r.buildings?.name, r.floor_level, r.area_inspected].filter(Boolean).join(" · ")}</p>
                {r.reviewed && r.severity_note && <p className="text-xs text-slate-500 dark:text-slate-400 truncate"><span className="font-medium">Note:</span> {r.severity_note}</p>}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0 text-xs text-slate-400">
                <span className="flex items-center gap-1"><User size={12}/> {r.inspector_name || "Unknown"}</span>
                <span className="flex items-center gap-1"><ImageIcon size={12}/> {r.photo_count} · {r.finding_count} findings</span>
                {r.highest_finding_severity && <span className="flex items-center gap-1">Highest <span className={SEVERITY_CLASS[r.highest_finding_severity]}>{r.highest_finding_severity}</span></span>}
              </div>
              <ChevronRight size={16} className="text-slate-300 shrink-0"/>
            </Link>
          </motion.div>
        ))}
      </ListShell>
    </div>
  );
}
