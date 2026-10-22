import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Inbox, X, Image as ImageIcon, MapPin, User, ClipboardCheck, Ban, CalendarClock, AlertTriangle, FileText, Circle, CheckCircle2, ShieldAlert, Eye } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import clsx from "clsx";
import { OPEN_STATUSES, STATUS_LABEL, STATUS_CLASS, SEVERITY_CLASS, fmtDateTime as fmtDate, fmtDay } from "../../utils/complaintUi.js";

const TABS = [
  { key: "pending",     label: "Pending" },
  { key: "assigned",    label: "Assigned" },
  { key: "in_progress", label: "In progress" },
  { key: "submitted",   label: "Awaiting review" },
  { key: "reviewed",    label: "Reviewed" },
  { key: "rejected",    label: "Rejected" },
];

const REVIEW_TABS = TABS.filter(t => t.key === "submitted" || t.key === "reviewed");

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const sortOpen = (a, b) => {
  if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
  if (a.days_overdue !== b.days_overdue) return b.days_overdue - a.days_overdue;
  if (!a.due_date !== !b.due_date) return a.due_date ? -1 : 1;
  if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
  return a.created_at < b.created_at ? 1 : -1;
};

function DueTag({ c }) {
  if (c.is_overdue) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
        <AlertTriangle size={11}/> Overdue by {c.days_overdue} day{c.days_overdue > 1 ? "s" : ""}
      </span>
    );
  }
  if (c.submitted_late) return <span className="text-[11px] font-medium text-red-600 dark:text-red-400">Submitted late</span>;
  if (c.due_date && OPEN_STATUSES.includes(c.status)) {
    return <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400"><CalendarClock size={11}/> Due {fmtDay(c.due_date)}</span>;
  }
  return null;
}

function Timeline({ c }) {
  const steps = [{ label: "Received", at: fmtDate(c.created_at), done: true }];
  if (c.status === "rejected") {
    steps.push({ label: `Rejected by ${c.reviewer || "a reviewer"}`, at: fmtDate(c.reviewed_at), done: true, note: c.reject_reason, danger: true });
  } else if (c.status !== "pending") {
    steps.push({ label: `Assigned to ${c.inspection?.inspector_name || "an inspector"} by ${c.reviewer || "a reviewer"}`, at: fmtDate(c.reviewed_at), done: true, note: c.due_date ? `Due ${fmtDay(c.due_date)}` : "No due date" });
    steps.push({ label: "Inspector started work", at: fmtDate(c.started_at), done: !!c.started_at });
    steps.push({ label: "Inspection submitted", at: fmtDate(c.submitted_at), done: !!c.submitted_at, note: c.submitted_late ? "Submitted after the due date" : null, danger: c.submitted_late });
    steps.push({
      label: c.status === "reviewed" ? `Reviewed by ${c.assessor || "a facility manager"}: severity ${c.severity}` : "Facility manager review",
      at: fmtDate(c.assessed_at),
      done: c.status === "reviewed",
    });
  }
  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm">
          {s.done
            ? <CheckCircle2 size={16} className={clsx("mt-0.5 shrink-0", s.danger ? "text-red-500" : "text-green-500")}/>
            : <Circle size={16} className="mt-0.5 shrink-0 text-slate-300 dark:text-slate-600"/>}
          <div className="min-w-0">
            <p className={clsx(s.done ? "text-slate-800 dark:text-slate-200" : "text-slate-400")}>{s.label}</p>
            {(s.at || s.note) && <p className={clsx("text-xs", s.danger ? "text-red-500" : "text-slate-400")}>{[s.at, s.note].filter(Boolean).join(" · ")}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function SeverityBlock({ c }) {
  return (
    <div className="mt-5 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <ShieldAlert size={16} className="text-slate-500"/>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Overall severity</span>
        <span className={SEVERITY_CLASS[c.severity]}>{c.severity}</span>
      </div>
      {c.severity_note && <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{c.severity_note}</p>}
      <p className="text-xs text-slate-400">Set by {c.assessor || "a facility manager"} on {fmtDate(c.assessed_at)}</p>
    </div>
  );
}

function ComplaintModal({ complaintId, onClose, onChanged }) {
  const [complaint, setComplaint] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [mode, setMode] = useState(null);
  const [convertForm, setConvertForm] = useState({ inspector_id: "", title: "", inspection_date: localToday(), due_date: "" });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/complaints/${complaintId}`).then(r => {
      setComplaint(r.data);
      setConvertForm(f => ({ ...f, title: `Complaint ${r.data.reference}` }));
    }).catch(() => { toast.error("Failed to load complaint"); onClose(); });
  }, [complaintId, onClose]);

  useEffect(() => {
    if (mode !== "convert" || assignees.length) return;
    api.get("/complaints/assignees").then(r => setAssignees(r.data)).catch(() => toast.error("Failed to load inspectors"));
  }, [mode, assignees.length]);

  const handleConvert = async () => {
    if (!convertForm.inspector_id) { toast.error("Choose an inspector"); return; }
    if (convertForm.due_date && convertForm.due_date < localToday()) { toast.error("Due date cannot be in the past"); return; }
    setBusy(true);
    try {
      await api.post(`/complaints/${complaintId}/convert`, {
        ...convertForm,
        inspection_date: convertForm.inspection_date || null,
        due_date: convertForm.due_date || null,
      }, { timeout: 60000 });
      toast.success("Converted into an inspection and assigned");
      onChanged();
    } catch (e) { toast.error(e.response?.data?.detail || "Conversion failed"); }
    finally { setBusy(false); }
  };

  const handleReject = async () => {
    if (reason.trim().length < 5) { toast.error("Give a reason of at least 5 characters"); return; }
    setBusy(true);
    try {
      await api.post(`/complaints/${complaintId}/reject`, { reason: reason.trim() });
      toast.success("Complaint rejected");
      onChanged();
    } catch (e) { toast.error(e.response?.data?.detail || "Reject failed"); }
    finally { setBusy(false); }
  };

  const canReview = complaint?.status === "submitted";

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="card w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-thin" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}>
        {!complaint ? (
          <div className="space-y-3"><div className="skeleton h-6 w-1/3 rounded"/><div className="skeleton h-40 w-full rounded"/><div className="skeleton h-4 w-2/3 rounded"/></div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-slate-900 dark:text-white font-mono">{complaint.reference}</h3>
                  <span className={STATUS_CLASS[complaint.status]}>{STATUS_LABEL[complaint.status]}</span>
                  {complaint.status === "reviewed" && <span className={SEVERITY_CLASS[complaint.severity]}>{complaint.severity}</span>}
                  <DueTag c={complaint}/>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Received {fmtDate(complaint.created_at)}</p>
              </div>
              <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X size={16}/></button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {complaint.photos.map((p, i) => p.url ? (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                  <img src={p.url} alt={`Complaint photo ${i + 1}`} className="w-full h-full object-cover hover:scale-105 transition-transform"/>
                </a>
              ) : (
                <div key={p.id} className="aspect-square rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400"><ImageIcon size={20}/></div>
              ))}
            </div>

            <div className="space-y-3 text-sm">
              <p className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                <MapPin size={15} className="text-slate-400 mt-0.5 shrink-0"/>
                <span><strong>{complaint.buildings?.name}</strong> ({complaint.buildings?.code}), {complaint.floor}. {complaint.location_note}</span>
              </p>
              <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">{complaint.description}</p>
              <p className="flex items-start gap-2 text-slate-500 dark:text-slate-400">
                <User size={15} className="text-slate-400 mt-0.5 shrink-0"/>
                <span>{[complaint.reporter_name, complaint.reporter_email, complaint.reporter_phone].filter(Boolean).join(" · ") || "Anonymous reporter"}</span>
              </p>
            </div>

            {complaint.status === "reviewed" && <SeverityBlock c={complaint}/>}

            {complaint.status !== "pending" && (
              <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Progress</h4>
                <Timeline c={complaint}/>
              </div>
            )}

            {complaint.inspection && (
              <div className="mt-5 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {complaint.inspection.reference && <span className="font-mono text-slate-500 dark:text-slate-400 mr-1.5">{complaint.inspection.reference}</span>}
                      {complaint.inspection.title}
                    </p>
                    <p className="text-xs text-slate-400">
                      Inspection {complaint.inspection.status} · {complaint.inspection.inspector_name || "Unknown inspector"} · {complaint.inspection.photo_count ?? 0} photos · {complaint.inspection.finding_count ?? 0} findings
                    </p>
                  </div>
                  <Link to={`/complaints/${complaint.id}/review`} className={canReview ? "btn-primary text-xs" : "btn-secondary text-xs"}>
                    {canReview ? <><ShieldAlert size={13}/> Review and set severity</> : <><Eye size={13}/> View inspection</>}
                  </Link>
                </div>
                {complaint.report && (
                  <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 min-w-0">
                      <FileText size={13} className="shrink-0"/><span className="truncate">{complaint.report.title}</span>
                      <span className={complaint.report.status === "published" ? "badge-green" : "badge-gray"}>{complaint.report.status}</span>
                    </p>
                    <Link to={`/reports/${complaint.report.id}`} state={{ from: "/complaints" }} className="btn-secondary text-xs"><FileText size={13}/> View report</Link>
                  </div>
                )}
              </div>
            )}

            {complaint.status === "pending" && (
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                {mode === null && (
                  <div className="flex gap-3">
                    <button onClick={() => setMode("reject")} className="btn-secondary flex-1"><Ban size={15}/> Reject</button>
                    <button onClick={() => setMode("convert")} className="btn-primary flex-1"><ClipboardCheck size={15}/> Convert to inspection</button>
                  </div>
                )}
                {mode === "convert" && (
                  <div className="space-y-3">
                    <div>
                      <label className="label">Assign to inspector</label>
                      <select value={convertForm.inspector_id} onChange={e => setConvertForm(f => ({ ...f, inspector_id: e.target.value }))} className="input">
                        <option value="">Select inspector...</option>
                        {assignees.map(a => <option key={a.id} value={a.id}>{a.name} ({a.email})</option>)}
                      </select>
                    </div>
                    <div><label className="label">Inspection title</label><input value={convertForm.title} onChange={e => setConvertForm(f => ({ ...f, title: e.target.value }))} className="input" maxLength={200}/></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div><label className="label">Inspection date</label><input type="date" value={convertForm.inspection_date} onChange={e => setConvertForm(f => ({ ...f, inspection_date: e.target.value }))} className="input"/></div>
                      <div><label className="label">Due date <span className="text-slate-400 font-normal">(optional)</span></label><input type="date" min={localToday()} value={convertForm.due_date} onChange={e => setConvertForm(f => ({ ...f, due_date: e.target.value }))} className="input"/></div>
                    </div>
                    <p className="text-xs text-slate-400">The inspector receives a draft inspection with these photos, records the details, runs the defect scan and submits it. A facility manager then sets the overall severity.</p>
                    <div className="flex gap-3">
                      <button onClick={() => setMode(null)} className="btn-secondary flex-1" disabled={busy}>Back</button>
                      <button onClick={handleConvert} className="btn-primary flex-1" disabled={busy}>{busy ? "Converting..." : "Convert and assign"}</button>
                    </div>
                  </div>
                )}
                {mode === "reject" && (
                  <div className="space-y-3">
                    <div>
                      <label className="label">Reason for rejecting</label>
                      <textarea value={reason} onChange={e => setReason(e.target.value)} className="input resize-none" rows={3} maxLength={500} placeholder="e.g. Duplicate of VIDA-C-0041, already scheduled for repair"/>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => setMode(null)} className="btn-secondary flex-1" disabled={busy}>Back</button>
                      <button onClick={handleReject} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-60" disabled={busy}>{busy ? "Rejecting..." : "Reject complaint"}</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function Complaints({ mode = "inbox" }) {
  const review = mode === "review";
  const tabs = review ? REVIEW_TABS : TABS;
  const [complaints, setComplaints] = useState([]);
  const [tab, setTab] = useState(review ? "submitted" : "pending");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const requested = searchParams.get("open");
    if (requested) setOpenId(requested);
  }, [searchParams]);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/complaints/").then(r => setComplaints(r.data)).catch(() => toast.error("Failed to load complaints")).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const closeModal = useCallback(() => {
    setOpenId(null);
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);
  const counts = tabs.reduce((acc, t) => ({ ...acc, [t.key]: complaints.filter(c => c.status === t.key).length }), {});
  const overdueCounts = tabs.reduce((acc, t) => ({ ...acc, [t.key]: complaints.filter(c => c.status === t.key && c.is_overdue).length }), {});
  const visible = complaints.filter(c => c.status === tab);
  if (OPEN_STATUSES.includes(tab)) visible.sort(sortOpen);

  return (
    <div className="space-y-6">
      <div className="page-header">
        {review ? (
          <>
            <h1 className="page-title flex items-center gap-2"><ShieldAlert size={22}/> Severity Review</h1>
            <p className="page-subtitle">Complaint inspections submitted by inspectors. Set one overall severity for each and it is sent to the admins.</p>
          </>
        ) : (
          <>
            <h1 className="page-title flex items-center gap-2"><Inbox size={22}/> Complaints</h1>
            <p className="page-subtitle">Defects reported by the public. Nothing here counts in statistics or reports until it is converted into an inspection.</p>
          </>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={clsx("px-4 py-2 rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-1.5", tab === t.key ? "bg-primary-600 text-white" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800")}>
            {t.label} <span className="opacity-75">({counts[t.key] || 0})</span>
            {overdueCounts[t.key] > 0 && <span className="px-1.5 rounded-full text-[10px] font-bold bg-red-500 text-white">{overdueCounts[t.key]} overdue</span>}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[...Array(4)].map((_, i) => <div key={i} className="p-4 space-y-2"><div className="skeleton h-4 w-1/4 rounded"/><div className="skeleton h-3 w-2/3 rounded"/></div>)}
          </div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center"><Inbox size={40} className="text-slate-300 dark:text-slate-700 mx-auto mb-3"/><p className="text-slate-400">No complaints {STATUS_LABEL[tab]}</p></div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map(c => (
              <button key={c.id} onClick={() => setOpenId(c.id)}
                className={clsx("w-full text-left flex items-start gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-l-4", c.is_overdue ? "border-red-500 bg-red-50/60 dark:bg-red-900/10" : "border-transparent")}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{c.reference}</span>
                    <span className={STATUS_CLASS[c.status]}>{STATUS_LABEL[c.status]}</span>
                    {c.status === "reviewed" && <span className={SEVERITY_CLASS[c.severity]}>{c.severity}</span>}
                    <DueTag c={c}/>
                    <span className="text-xs text-slate-400">{fmtDate(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 truncate">{c.description}</p>
                  {c.status === "reviewed" && c.severity_note && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate"><span className="font-medium">Note:</span> {c.severity_note}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{c.buildings?.name} · {c.floor} · {c.location_note}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 text-xs text-slate-400">
                  {c.inspection?.inspector_name && <span className="flex items-center gap-1"><User size={12}/> {c.inspection.inspector_name}</span>}
                  {c.status === "submitted" && <span className="text-violet-600 dark:text-violet-400 font-medium">Ready for your review</span>}
                  <span className="flex items-center gap-1"><ImageIcon size={12}/> {c.photo_count}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {openId && (
          <ComplaintModal
            complaintId={openId}
            onClose={closeModal}
            onChanged={() => { closeModal(); load(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
