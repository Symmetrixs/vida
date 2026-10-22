import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, MapPin, ClipboardList, Image as ImageIcon, ShieldAlert, Send, Inbox, Cloud, Calendar, User } from "lucide-react";
import api from "../../api/axios.js";
import { useAuth } from "../../context/AuthContext.jsx";
import toast from "react-hot-toast";
import clsx from "clsx";
import { STATUS_LABEL, STATUS_CLASS, SEVERITIES, SEVERITY_CLASS, SEVERITY_HELP, fmtDateTime, fmtDay } from "../../utils/complaintUi.js";

const label = (s) => (s || "").replace(/_/g, " ");

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

export default function ComplaintReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const inbox = hasRole("facility_manager") ? "/severity-review" : "/notifications";
  const [data, setData] = useState(null);
  const [severity, setSeverity] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/complaints/${id}/review`).then(r => setData(r.data)).catch(() => {
      toast.error("Failed to load the inspection");
      navigate(inbox);
    });
  }, [id, inbox, navigate]);

  const handleSubmit = async () => {
    if (!severity) { toast.error("Choose an overall severity"); return; }
    setBusy(true);
    try {
      await api.post(`/complaints/${id}/review`, { severity, note: note.trim() || null });
      toast.success("Review sent to admin");
      navigate(inbox);
    } catch (e) { toast.error(e.response?.data?.detail || "Review failed"); }
    finally { setBusy(false); }
  };

  if (!data) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"/>
    </div>
  );

  const { complaint: c, inspection, photos, findings, highest_finding_severity: highest, can_review: canReview } = data;
  const findingsByPhoto = findings.reduce((acc, f) => ({ ...acc, [f.photo_id || "none"]: [...(acc[f.photo_id || "none"] || []), f] }), {});

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="page-header">
        <button onClick={() => navigate(inbox)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-600 mb-3 transition-colors">
          <ArrowLeft size={15}/> Back
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="page-title font-mono">{c.reference}</h1>
          <span className={STATUS_CLASS[c.status]}>{STATUS_LABEL[c.status]}</span>
          {c.status === "reviewed" && <span className={SEVERITY_CLASS[c.severity]}>{c.severity}</span>}
          {c.submitted_late && <span className="text-xs font-medium text-red-600 dark:text-red-400">Submitted late</span>}
        </div>
        <p className="page-subtitle">
          {c.submitted_at ? `Submitted ${fmtDateTime(c.submitted_at)}` : "Not submitted yet"}
          {c.due_date ? ` · Due ${fmtDay(c.due_date)}` : ""}
        </p>
      </div>

      <Section icon={Inbox} title="Original complaint">
        <p className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300 mb-2">
          <MapPin size={15} className="text-slate-400 mt-0.5 shrink-0"/>
          <span><strong>{c.buildings?.name}</strong> ({c.buildings?.code}), {c.floor}. {c.location_note}</span>
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">{c.description}</p>
        {c.photos?.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
            {c.photos.map((p, i) => p.url && (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                <img src={p.url} alt={`Reported photo ${i + 1}`} className="w-full h-full object-cover"/>
              </a>
            ))}
          </div>
        )}
      </Section>

      {inspection ? (
        <Section icon={ClipboardList} title="Recorded inspection" extra={<span className="text-xs text-slate-400 flex items-center gap-1"><User size={12}/> {inspection.inspector_name || "Unknown inspector"}</span>}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field name="Inspection number" value={inspection.reference}/>
            <Field name="Title" value={inspection.title}/>
            <Field name="Inspection status" value={inspection.status}/>
            <div className="flex gap-6">
              {inspection.inspection_date && <p className="text-sm text-slate-700 dark:text-slate-300 flex items-center gap-1.5"><Calendar size={14} className="text-slate-400"/> {fmtDay(inspection.inspection_date)}</p>}
              {inspection.weather_condition && <p className="text-sm text-slate-700 dark:text-slate-300 flex items-center gap-1.5 capitalize"><Cloud size={14} className="text-slate-400"/> {inspection.weather_condition}</p>}
            </div>
            <Field name="Floor and area" value={[inspection.floor_level, inspection.area_inspected].filter(Boolean).join(" · ")}/>
            <div className="sm:col-span-2"><Field name="Description" value={inspection.description}/></div>
            <div className="sm:col-span-2"><Field name="Remarks" value={inspection.remarks}/></div>
          </div>
        </Section>
      ) : (
        <div className="card p-5 text-sm text-slate-400">No inspection is linked to this complaint.</div>
      )}

      {inspection && (
        <Section icon={ImageIcon} title={`Photos and AI findings (${findings.length})`}
          extra={highest && <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">Highest finding <span className={SEVERITY_CLASS[highest]}>{highest}</span></span>}>
          {photos.length === 0 ? (
            <p className="text-sm text-slate-400">No photos recorded.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {photos.map(p => (
                <div key={p.id} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.description || "Inspection photo"} className="w-full aspect-video object-cover"/></a>
                  <div className="p-3 space-y-1.5">
                    {(findingsByPhoto[p.id] || []).length === 0 ? (
                      <p className="text-xs text-slate-400">No findings on this photo</p>
                    ) : findingsByPhoto[p.id].map(f => (
                      <div key={f.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="capitalize text-slate-700 dark:text-slate-300">{label(f.defect_type)}</span>
                        <span className="flex items-center gap-1.5">
                          {f.confidence != null && <span className="text-slate-400">{Math.round(f.confidence * 100)}%</span>}
                          <span className={SEVERITY_CLASS[f.severity] || "badge-gray"}>{f.severity}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {(findingsByPhoto.none || []).length > 0 && (
            <div className="mt-4 space-y-1.5">
              <p className="text-xs font-medium text-slate-500">Findings not tied to a photo</p>
              {findingsByPhoto.none.map(f => (
                <div key={f.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="capitalize text-slate-700 dark:text-slate-300">{label(f.defect_type)}{f.location_description ? ` · ${f.location_description}` : ""}</span>
                  <span className={SEVERITY_CLASS[f.severity] || "badge-gray"}>{f.severity}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      <Section icon={ShieldAlert} title="Overall severity">
        {c.status === "reviewed" ? (
          <div className="space-y-2">
            <span className={clsx(SEVERITY_CLASS[c.severity], "text-sm px-3 py-1")}>{c.severity}</span>
            {c.severity_note && <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{c.severity_note}</p>}
            <p className="text-xs text-slate-400">Set by {c.assessor || "a facility manager"} on {fmtDateTime(c.assessed_at)}</p>
          </div>
        ) : canReview ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {SEVERITIES.map(s => (
                <button key={s} type="button" onClick={() => setSeverity(s)}
                  className={clsx("rounded-xl border-2 p-3 text-left transition-colors", severity === s ? "border-primary-600 bg-primary-50 dark:bg-primary-900/20" : "border-slate-200 dark:border-slate-700 hover:border-slate-300")}>
                  <span className={SEVERITY_CLASS[s]}>{s}</span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-snug">{SEVERITY_HELP[s]}</p>
                </button>
              ))}
            </div>
            <div>
              <label className="label">Note to admin <span className="text-slate-400 font-normal">(optional)</span></label>
              <textarea value={note} onChange={e => setNote(e.target.value)} className="input resize-none" rows={3} maxLength={1000} placeholder="e.g. Crack is widening near the beam. Recommend closing the corridor until repaired."/>
              <p className="text-[11px] text-slate-400 mt-1 text-right">{note.length}/1000</p>
            </div>
            <div className="flex justify-end">
              <motion.button onClick={handleSubmit} disabled={busy || !severity} className="btn-primary" whileTap={{ scale: 0.97 }}>
                {busy ? "Sending..." : <span className="flex items-center gap-2"><Send size={15}/> Send to admin</span>}
              </motion.button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {c.status === "submitted" ? "Waiting for a facility manager to set the overall severity." : "The inspector has not submitted this inspection yet."}
          </p>
        )}
      </Section>
    </div>
  );
}
