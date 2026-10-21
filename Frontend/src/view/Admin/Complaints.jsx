import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Inbox, X, Image as ImageIcon, MapPin, User, ClipboardCheck, Ban } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import clsx from "clsx";

const TABS = [
  { key: "pending",   label: "Pending" },
  { key: "converted", label: "Converted" },
  { key: "rejected",  label: "Rejected" },
];

const STATUS_BADGE = { pending: "badge-yellow", converted: "badge-green", rejected: "badge-red" };

const fmtDate = (iso) => iso ? new Date(iso).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" }) : "";
const today = () => new Date().toISOString().slice(0, 10);

function ComplaintModal({ complaintId, onClose, onChanged }) {
  const [complaint, setComplaint] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [mode, setMode] = useState(null);
  const [convertForm, setConvertForm] = useState({ inspector_id: "", title: "", inspection_date: today() });
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
    setBusy(true);
    try {
      await api.post(`/complaints/${complaintId}/convert`, { ...convertForm, inspection_date: convertForm.inspection_date || null }, { timeout: 60000 });
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
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900 dark:text-white font-mono">{complaint.reference}</h3>
                  <span className={STATUS_BADGE[complaint.status]}>{complaint.status}</span>
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
              {complaint.status === "rejected" && (
                <p className="text-red-600 dark:text-red-400 text-xs">Rejected by {complaint.reviewer || "a reviewer"} on {fmtDate(complaint.reviewed_at)}: {complaint.reject_reason}</p>
              )}
              {complaint.status === "converted" && (
                <p className="text-green-700 dark:text-green-400 text-xs">
                  Converted by {complaint.reviewer || "a reviewer"} on {fmtDate(complaint.reviewed_at)}
                  {complaint.inspections ? ` into inspection "${complaint.inspections.title}" (${complaint.inspections.status})` : ". The inspection has since been deleted."}
                </p>
              )}
            </div>

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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div><label className="label">Inspection title</label><input value={convertForm.title} onChange={e => setConvertForm(f => ({ ...f, title: e.target.value }))} className="input" maxLength={200}/></div>
                      <div><label className="label">Inspection date</label><input type="date" value={convertForm.inspection_date} onChange={e => setConvertForm(f => ({ ...f, inspection_date: e.target.value }))} className="input"/></div>
                    </div>
                    <p className="text-xs text-slate-400">The inspector receives a draft inspection with these photos and runs the defect scan from it.</p>
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

export default function Complaints() {
  const [complaints, setComplaints] = useState([]);
  const [tab, setTab] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/complaints/").then(r => setComplaints(r.data)).catch(() => toast.error("Failed to load complaints")).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const closeModal = useCallback(() => setOpenId(null), []);
  const counts = TABS.reduce((acc, t) => ({ ...acc, [t.key]: complaints.filter(c => c.status === t.key).length }), {});
  const visible = complaints.filter(c => c.status === tab);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><Inbox size={22}/> Complaints</h1>
        <p className="page-subtitle">Defects reported by the public. Nothing here counts in statistics or reports until it is converted into an inspection.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={clsx("px-4 py-2 rounded-xl text-sm font-medium transition-colors", tab === t.key ? "bg-primary-600 text-white" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800")}>
            {t.label} <span className="ml-1 opacity-75">({counts[t.key] || 0})</span>
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[...Array(4)].map((_, i) => <div key={i} className="p-4 space-y-2"><div className="skeleton h-4 w-1/4 rounded"/><div className="skeleton h-3 w-2/3 rounded"/></div>)}
          </div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center"><Inbox size={40} className="text-slate-300 dark:text-slate-700 mx-auto mb-3"/><p className="text-slate-400">No {tab} complaints</p></div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map(c => (
              <button key={c.id} onClick={() => setOpenId(c.id)} className="w-full text-left flex items-start gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{c.reference}</span>
                    <span className={STATUS_BADGE[c.status]}>{c.status}</span>
                    <span className="text-xs text-slate-400">{fmtDate(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 truncate">{c.description}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{c.buildings?.name} · {c.floor} · {c.location_note}</p>
                </div>
                <span className="flex items-center gap-1 text-xs text-slate-400 shrink-0"><ImageIcon size={13}/> {c.photo_count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {openId && <ComplaintModal complaintId={openId} onClose={closeModal} onChanged={() => { setOpenId(null); load(); }}/>}
      </AnimatePresence>
    </div>
  );
}
