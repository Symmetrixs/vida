import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, ClipboardList, Image as ImageIcon, Wrench, History, Scale, Hand, UserPlus, CheckCircle2, Undo2,
  Shuffle, Upload, Trash2, Send, Save, MapPin, Inbox, User, Circle, Eye,
} from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { apiErrorText } from "../../utils/apiError.js";
import clsx from "clsx";
import { JobNumbers, JobBadges } from "../../components/RepairParts.jsx";
import { SEVERITY_CLASS, fmtDateTime, fmtDay } from "../../utils/complaintUi.js";
import { EVENT_TEXT, countsText, defectLabel, localToday } from "../../utils/repairUi.js";

function Section({ icon: Icon, title, children, extra }) {
  return (
    <motion.div className="card p-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Icon size={17} className="text-primary-600"/> {title}</h2>
        {extra}
      </div>
      {children}
    </motion.div>
  );
}

function Field({ name, value }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{name}</p>
      <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function WorkerPicker({ workers, value, onChange, exclude }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="input">
      <option value="">Select maintenance worker...</option>
      {workers.filter(w => w.id !== exclude).map(w => (
        <option key={w.id} value={w.id}>{w.name} ({w.active} active{w.overdue ? `, ${w.overdue} overdue` : ""})</option>
      ))}
    </select>
  );
}

function PhotoTile({ photo, onDelete }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt="Completion" className="w-full aspect-video object-cover"/></a>
      <div className="p-2.5 flex items-start justify-between gap-2">
        <p className={clsx("text-xs", photo.scanned ? "text-slate-600 dark:text-slate-300" : "text-amber-600")}>
          {photo.scanned ? `AI: ${countsText(photo.counts)}` : "AI scan unavailable"}
        </p>
        {onDelete && <button onClick={() => onDelete(photo)} className="btn-ghost p-1 rounded-lg text-red-500" title="Delete photo"><Trash2 size={14}/></button>}
      </div>
    </div>
  );
}

function Timeline({ events }) {
  return (
    <ol className="space-y-3">
      {events.map(e => (
        <li key={e.id} className="flex items-start gap-2.5 text-sm">
          <CheckCircle2 size={16} className={clsx("mt-0.5 shrink-0", e.event === "sent_back" ? "text-orange-500" : e.event === "approved" ? "text-green-500" : "text-primary-500")}/>
          <div className="min-w-0">
            <p className="text-slate-800 dark:text-slate-200">{(EVENT_TEXT[e.event] || (() => e.event))(e)}</p>
            <p className="text-xs text-slate-400">{fmtDateTime(e.created_at)}</p>
            {e.reason && <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5"><span className="font-medium">Reason:</span> {e.reason}</p>}
            {e.note && <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 whitespace-pre-wrap"><span className="font-medium">{e.event === "submitted" ? "Repair notes:" : "Note:"}</span> {e.note}</p>}
          </div>
        </li>
      ))}
      {events.length === 0 && <li className="flex items-center gap-2 text-sm text-slate-400"><Circle size={16}/> No history yet</li>}
    </ol>
  );
}

export default function RepairJob() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInput = useRef(null);
  const [data, setData] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [action, setAction] = useState(null);
  const [form, setForm] = useState({ worker_id: "", due_date: "", reason: "", note: "" });

  const load = useCallback(() => {
    return api.get(`/repairs/${id}`).then(r => {
      setData(r.data);
      setNotes(r.data.job.repair_notes || "");
    }).catch((e) => {
      toast.error(e.response?.status === 403 ? "This job is no longer yours" : apiErrorText(e, "Failed to load the repair job"));
      navigate("/");
    });
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const permissions = data?.permissions;
  const needsWorkers = permissions && (permissions.can_assign || permissions.can_reassign);
  useEffect(() => {
    if (!needsWorkers || workers.length) return;
    api.get("/repairs/staff").then(r => setWorkers(r.data)).catch(e => toast.error(apiErrorText(e, "Failed to load maintenance staff")));
  }, [needsWorkers, workers.length]);

  const run = async (request, success) => {
    setBusy(true);
    try {
      await request();
      toast.success(success);
      setAction(null);
      setForm({ worker_id: "", due_date: "", reason: "", note: "" });
      await load();
    } catch (e) {
      toast.error(apiErrorText(e, "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  const claim = () => run(() => api.post(`/repairs/${id}/claim`), "Job claimed. It is now in My Claimed Jobs.");
  const assign = () => {
    if (!form.worker_id) { toast.error("Choose a worker"); return; }
    run(() => api.post(`/repairs/${id}/assign`, { worker_id: form.worker_id, due_date: form.due_date || null }), "Job assigned");
  };
  const reassign = () => {
    if (!form.worker_id) { toast.error("Choose a worker"); return; }
    if (form.reason.trim().length < 5) { toast.error("Give a reason of at least 5 characters"); return; }
    run(() => api.post(`/repairs/${id}/reassign`, { worker_id: form.worker_id, reason: form.reason.trim(), due_date: form.due_date || null }), "Job reassigned");
  };
  const sendBack = () => {
    if (form.reason.trim().length < 5) { toast.error("Give a reason of at least 5 characters"); return; }
    run(() => api.post(`/repairs/${id}/send-back`, { reason: form.reason.trim() }), "Sent back for rework");
  };
  const approve = () => run(() => api.post(`/repairs/${id}/approve`, { note: form.note.trim() || null }), "Repair approved");
  const saveNotes = () => run(() => api.put(`/repairs/${id}/notes`, { notes }), "Notes saved");
  const submit = () => {
    if (notes.trim().length < 5) { toast.error("Describe the repair in at least 5 characters"); return; }
    run(() => api.post(`/repairs/${id}/submit`, { notes: notes.trim() }), "Submitted for review");
  };

  const upload = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setUploading(list.length);
    for (const file of list) {
      const body = new FormData();
      body.append("file", file);
      try {
        const r = await api.post(`/repairs/${id}/photos`, body, { timeout: 120000 });
        toast.success(r.data.scanned ? `Uploaded. AI: ${countsText(r.data.counts)}` : "Uploaded. AI scan unavailable.");
      } catch (e) {
        toast.error(apiErrorText(e, `Upload failed: ${file.name}`));
      }
      setUploading(n => n - 1);
    }
    if (fileInput.current) fileInput.current.value = "";
    load();
  };

  const removePhoto = async (photo) => {
    try {
      await api.delete(`/repairs/${id}/photos/${photo.id}`);
      load();
    } catch (e) { toast.error(apiErrorText(e, "Delete failed")); }
  };

  if (!data) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"/>
    </div>
  );

  const { job, inspection, complaint, photos, findings, completion_photos: completion, events, comparison, before_scanned: beforeScanned, after_scanned: afterScanned } = data;
  const current = completion.filter(p => p.round === job.round);
  const earlier = completion.filter(p => p.round !== job.round);
  const findingsByPhoto = findings.reduce((acc, f) => ({ ...acc, [f.photo_id || "none"]: [...(acc[f.photo_id || "none"] || []), f] }), {});
  const showComparison = completion.length > 0 || ["awaiting_review", "done"].includes(job.status);
  const lastSendBack = [...events].reverse().find(e => e.event === "sent_back");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="page-header">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-600 mb-3 transition-colors">
          <ArrowLeft size={15}/> Back
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <JobNumbers job={job} large/>
          <JobBadges job={job}/>
        </div>
        <p className="page-subtitle">
          {job.worker_name ? `${job.assignment_type === "claimed" ? "Claimed by" : "Assigned to"} ${job.worker_name}` : "Not taken yet"}
          {job.due_date ? ` · Due ${fmtDay(job.due_date)}` : ""}
          {job.submitted_at && job.status !== "in_progress" ? ` · Submitted ${fmtDateTime(job.submitted_at)}` : ""}
          {job.completed_at ? ` · Approved ${fmtDateTime(job.completed_at)}` : ""}
        </p>
      </div>

      {permissions.can_claim && (
        <div className="card p-5 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-slate-600 dark:text-slate-300">This job is on the Job Board. Claim it to start the repair.</p>
          <button onClick={claim} disabled={busy} className="btn-primary"><Hand size={15}/> Claim this job</button>
        </div>
      )}

      {permissions.can_assign && (
        <Section icon={UserPlus} title="Assign a worker">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">Worker</label><WorkerPicker workers={workers} value={form.worker_id} onChange={v => setForm(f => ({ ...f, worker_id: v }))}/></div>
            <div><label className="label">Due date <span className="text-slate-400 font-normal">(optional)</span></label><input type="date" min={localToday()} value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="input"/></div>
          </div>
          <div className="flex justify-end mt-3"><button onClick={assign} disabled={busy} className="btn-primary"><UserPlus size={15}/> Assign</button></div>
        </Section>
      )}

      {(permissions.can_review || permissions.can_reassign) && (
        <Section icon={Scale} title={job.status === "awaiting_review" ? "Review this repair" : "Manage this job"}>
          <div className="flex flex-wrap gap-2">
            {permissions.can_review && <button onClick={() => setAction(action === "approve" ? null : "approve")} className={action === "approve" ? "btn-primary" : "btn-secondary"}><CheckCircle2 size={15}/> Approve</button>}
            {permissions.can_review && <button onClick={() => setAction(action === "send_back" ? null : "send_back")} className={action === "send_back" ? "btn-primary" : "btn-secondary"}><Undo2 size={15}/> Send back</button>}
            {permissions.can_reassign && <button onClick={() => setAction(action === "reassign" ? null : "reassign")} className={action === "reassign" ? "btn-primary" : "btn-secondary"}><Shuffle size={15}/> Reassign</button>}
          </div>
          {job.status === "awaiting_review" && !permissions.can_review && (
            <p className="text-xs text-slate-400 mt-3">You did this repair yourself, so another facility manager must approve or send it back.</p>
          )}
          {action === "approve" && (
            <div className="mt-4 space-y-3">
              <div><label className="label">Note <span className="text-slate-400 font-normal">(optional)</span></label><textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className="input resize-none" rows={2} maxLength={2000}/></div>
              <div className="flex justify-end"><button onClick={approve} disabled={busy} className="btn-primary"><CheckCircle2 size={15}/> Approve and close the job</button></div>
            </div>
          )}
          {action === "send_back" && (
            <div className="mt-4 space-y-3">
              <div><label className="label">What still needs fixing</label><textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="input resize-none" rows={3} maxLength={500} placeholder="e.g. Crack is still visible at the left corner of the beam"/></div>
              <p className="text-xs text-slate-400">The job goes back to {job.worker_name || "the same worker"} and is marked as Rework.</p>
              <div className="flex justify-end"><button onClick={sendBack} disabled={busy} className="btn-primary"><Undo2 size={15}/> Send back</button></div>
            </div>
          )}
          {action === "reassign" && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="label">New worker</label><WorkerPicker workers={workers} value={form.worker_id} onChange={v => setForm(f => ({ ...f, worker_id: v }))} exclude={job.assigned_to}/></div>
                <div><label className="label">Due date <span className="text-slate-400 font-normal">(optional)</span></label><input type="date" min={localToday()} value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="input"/></div>
              </div>
              <div><label className="label">Reason</label><textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="input resize-none" rows={2} maxLength={500} placeholder="e.g. Needs a certified electrician"/></div>
              <div className="flex justify-end"><button onClick={reassign} disabled={busy} className="btn-primary"><Shuffle size={15}/> Reassign</button></div>
            </div>
          )}
        </Section>
      )}

      {permissions.can_work && (
        <Section icon={Wrench} title={job.is_rework ? "Rework this repair" : "Your repair work"}>
          {lastSendBack && job.is_rework && (
            <div className="mb-4 p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 text-sm text-orange-800 dark:text-orange-300">
              <span className="font-semibold">Sent back by {lastSendBack.actor_name || "a facility manager"}:</span> {lastSendBack.reason}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                <p className="label mb-0">Completion photos</p>
                <label className={clsx("btn-secondary text-xs cursor-pointer", uploading && "opacity-60 pointer-events-none")}>
                  <Upload size={13}/> {uploading ? `Uploading and scanning (${uploading})...` : "Add photos"}
                  <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => upload(e.target.files)}/>
                </label>
              </div>
              {current.length === 0 ? (
                <p className="text-sm text-slate-400">No photos yet. Each photo is scanned by the AI model when you upload it.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {current.map(p => <PhotoTile key={p.id} photo={p} onDelete={removePhoto}/>)}
                </div>
              )}
            </div>
            <div>
              <label className="label">Repair notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input resize-none" rows={4} maxLength={2000} placeholder="What was repaired, materials used, anything the facility manager should know"/>
              <p className="text-[11px] text-slate-400 mt-1 text-right">{notes.length}/2000</p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={saveNotes} disabled={busy} className="btn-secondary"><Save size={15}/> Save notes</button>
              <button onClick={submit} disabled={busy || current.length === 0 || uploading > 0} className="btn-primary"><Send size={15}/> Submit for review</button>
            </div>
          </div>
        </Section>
      )}

      {showComparison && (
        <Section icon={Scale} title="Before and after"
          extra={<span className="text-xs text-slate-400">AI counts use the same model and threshold on both sides</span>}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Before ({inspection.reference})</p>
              <div className="grid grid-cols-3 gap-2">
                {photos.slice(0, 6).map(p => (
                  <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700"><img src={p.url} alt="Before" className="w-full h-full object-cover"/></a>
                ))}
                {photos.length === 0 && <p className="text-sm text-slate-400 col-span-3">No inspection photos</p>}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">After (submission {job.round})</p>
              <div className="grid grid-cols-3 gap-2">
                {current.slice(0, 6).map(p => (
                  <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700"><img src={p.url} alt="After" className="w-full h-full object-cover"/></a>
                ))}
                {current.length === 0 && <p className="text-sm text-slate-400 col-span-3">No completion photos in this submission yet</p>}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="py-2 pr-3">Defect</th>
                  <th className="py-2 px-3 text-right">Inspector findings</th>
                  <th className="py-2 px-3 text-right">AI before</th>
                  <th className="py-2 pl-3 text-right">AI after</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {comparison.filter(r => r.findings || r.before || r.after).map(r => (
                  <tr key={r.label}>
                    <td className="py-2 pr-3 capitalize text-slate-700 dark:text-slate-300">{defectLabel(r.label)}</td>
                    <td className="py-2 px-3 text-right">{r.findings}</td>
                    <td className="py-2 px-3 text-right">{beforeScanned ? r.before : "-"}</td>
                    <td className={clsx("py-2 pl-3 text-right font-semibold", r.after === 0 ? "text-green-600" : r.after < r.before ? "text-amber-600" : "text-red-600")}>{afterScanned ? r.after : "-"}</td>
                  </tr>
                ))}
                {comparison.every(r => !r.findings && !r.before && !r.after) && (
                  <tr><td colSpan={4} className="py-3 text-slate-400">No defects detected on either side</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {(!beforeScanned || !afterScanned) && (
            <p className="text-xs text-amber-600 mt-3">
              {!beforeScanned && "The inspection photos could not be scanned when this job was created. "}
              {!afterScanned && current.length > 0 && "Some completion photos could not be scanned."}
            </p>
          )}
          {job.repair_notes && job.status !== "in_progress" && (
            <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Repair notes</p>
              <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{job.repair_notes}</p>
            </div>
          )}
        </Section>
      )}

      {earlier.length > 0 && (
        <Section icon={ImageIcon} title="Earlier submissions">
          {[...new Set(earlier.map(p => p.round))].sort((a, b) => b - a).map(round => (
            <div key={round} className="mb-4 last:mb-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Submission {round}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {earlier.filter(p => p.round === round).map(p => <PhotoTile key={p.id} photo={p}/>)}
              </div>
            </div>
          ))}
        </Section>
      )}

      <Section icon={ClipboardList} title="Inspection report"
        extra={(permissions.can_assign || permissions.can_reassign || permissions.can_review) && (
          <Link to={`/inspections/${inspection.id}/review`} className="btn-secondary text-xs"><Eye size={13}/> Open inspection</Link>
        )}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field name="Title" value={inspection.title}/>
          <Field name="Inspector" value={inspection.inspector_name}/>
          <Field name="Location" value={[inspection.buildings?.name, inspection.floor_level, inspection.area_inspected].filter(Boolean).join(" · ")}/>
          <Field name="Inspection date" value={inspection.inspection_date && fmtDay(inspection.inspection_date)}/>
          <div className="sm:col-span-2"><Field name="Description" value={inspection.description}/></div>
          <div className="sm:col-span-2"><Field name="Remarks" value={inspection.remarks}/></div>
        </div>
        {inspection.severity && (
          <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1">
            <div className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Overall severity</span><span className={SEVERITY_CLASS[inspection.severity]}>{inspection.severity}</span></div>
            {inspection.severity_note && <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{inspection.severity_note}</p>}
            <p className="text-xs text-slate-400">Set by {inspection.assessor || "a facility manager"}{inspection.assessed_at ? ` on ${fmtDateTime(inspection.assessed_at)}` : ""}</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {photos.map(p => (
            <div key={p.id} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.description || "Inspection photo"} className="w-full aspect-video object-cover"/></a>
              <div className="p-3 space-y-1.5">
                {(findingsByPhoto[p.id] || []).length === 0 ? (
                  <p className="text-xs text-slate-400">No findings on this photo</p>
                ) : findingsByPhoto[p.id].map(f => (
                  <div key={f.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">
                      <span className="capitalize">{defectLabel(f.defect_type)}{f.location_description ? ` · ${f.location_description}` : ""}</span>
                      <span className="block text-[11px] text-slate-400">{f.source === "ai" ? `AI, ${Math.round((f.confidence || 0) * 100)}% confidence` : "Logged manually"}</span>
                    </span>
                    <span className={SEVERITY_CLASS[f.severity] || "badge-gray"}>{f.severity}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {complaint && (
        <Section icon={Inbox} title={`Public complaint ${complaint.reference}`}>
          <p className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300 mb-2">
            <MapPin size={15} className="text-slate-400 mt-0.5 shrink-0"/>
            <span><strong>{complaint.building?.name}</strong>, {complaint.floor}. {complaint.location_note}</span>
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">{complaint.description}</p>
        </Section>
      )}

      <Section icon={History} title="History" extra={job.worker_name && <span className="text-xs text-slate-400 flex items-center gap-1"><User size={12}/> {job.worker_name}</span>}>
        <Timeline events={events}/>
      </Section>
    </div>
  );
}
