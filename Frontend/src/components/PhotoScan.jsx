import { useState } from "react";
import { AlertTriangle, Check, CircleDashed, Loader2, Pencil, RotateCw, Scan, ShieldCheck, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import api from "../api/axios.js";
import { apiErrorText } from "../utils/apiError.js";
import { DEFECT_COLORS, DEFECT_TYPES, SEVERITIES, boxesFor, defectLabel, findingSource, isAiFinding, severityLabel } from "../utils/findings.js";

export function ScanStatus({ photo, findings, scanning, failed }) {
  if (scanning) return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600"><Loader2 size={12} className="animate-spin"/> Scanning</span>;
  if (failed) return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600" title={failed}><AlertTriangle size={12}/> Scan failed</span>;
  if (!photo.scanned_at) return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600"><CircleDashed size={12}/> Not scanned</span>;
  const ai = findings.filter(isAiFinding).length;
  if (ai === 0) return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600"><ShieldCheck size={12}/> Scanned, AI found no defects</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600"><Check size={12}/> Scanned, {ai} AI finding{ai !== 1 ? "s" : ""}</span>;
}

export function ScanButton({ photo, scanning, failed, onScan, disabled }) {
  if (scanning) {
    return <button disabled className="btn-secondary w-full text-[11px] py-1.5 justify-center"><Loader2 size={12} className="animate-spin"/> Scanning</button>;
  }
  if (failed) {
    return <button onClick={onScan} disabled={disabled} className="btn-danger w-full text-[11px] py-1.5 justify-center"><RotateCw size={12}/> Retry scan</button>;
  }
  return (
    <button onClick={onScan} disabled={disabled} className={`${photo.scanned_at ? "btn-secondary" : "btn-primary"} w-full text-[11px] py-1.5 justify-center`}>
      {photo.scanned_at ? <><RotateCw size={12}/> Scan again</> : <><Scan size={12}/> AI Scan</>}
    </button>
  );
}

export function DetectionOverlay({ findings, natural, fit = "contain" }) {
  const boxes = boxesFor(findings);
  if (!boxes.length || !natural) return null;
  const { w, h } = natural;
  const stroke = Math.max(2, Math.round(Math.max(w, h) / 200));
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio={fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}>
      {boxes.map((f, i) => {
        const b = f.bbox;
        const kx = b.width ? w / b.width : 1;
        const ky = b.height ? h / b.height : 1;
        const color = DEFECT_COLORS[f.defect_type] || "#6366f1";
        return <rect key={f.id || i} x={b.xmin * kx} y={b.ymin * ky} width={(b.xmax - b.xmin) * kx} height={(b.ymax - b.ymin) * ky} stroke={color} strokeWidth={stroke} fill={`${color}22`} rx={stroke}/>;
      })}
    </svg>
  );
}

export function PhotoWithBoxes({ photo, findings, className = "", fit = "contain", onClick, children }) {
  const [natural, setNatural] = useState(null);
  return (
    <div className={`relative ${className}`} onClick={onClick}>
      <img
        src={photo.url}
        alt={photo.label || "Inspection photo"}
        className={`w-full h-full ${fit === "cover" ? "object-cover" : "object-contain"} pointer-events-none select-none`}
        onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
      />
      <DetectionOverlay findings={findings} natural={natural} fit={fit}/>
      {children}
    </div>
  );
}

export function FindingItem({ finding, index, editable, onChanged, onRemoved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ defect_type: finding.defect_type, severity: finding.severity });
  const [busy, setBusy] = useState(false);
  const color = DEFECT_COLORS[finding.defect_type] || "#6366f1";

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.put(`/findings/${finding.id}`, draft);
      onChanged?.(r.data);
      setEditing(false);
    } catch (e) { toast.error(apiErrorText(e, "Failed to update finding")); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    const ai = isAiFinding(finding);
    if (!confirm(ai ? "Remove this AI finding? It is kept in the record as dismissed and will not come back on a rescan." : "Delete this manually logged finding?")) return;
    setBusy(true);
    try {
      await api.delete(`/findings/${finding.id}`);
      onRemoved?.(finding.id);
    } catch (e) { toast.error(apiErrorText(e, "Failed to remove finding")); setBusy(false); }
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 space-y-2 bg-white dark:bg-slate-900">
        <div className="grid grid-cols-2 gap-2">
          <select value={draft.defect_type} onChange={e => setDraft(d => ({ ...d, defect_type: e.target.value }))} className="input text-xs py-1.5">
            {DEFECT_TYPES.map(t => <option key={t} value={t}>{defectLabel(t)}</option>)}
          </select>
          <select value={draft.severity} onChange={e => setDraft(d => ({ ...d, severity: e.target.value }))} className="input text-xs py-1.5">
            {SEVERITIES.map(s => <option key={s} value={s}>{severityLabel(s)}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-1.5">
          <button onClick={() => setEditing(false)} className="btn-ghost text-xs px-2 py-1"><X size={12}/> Cancel</button>
          <button onClick={save} disabled={busy} className="btn-primary text-xs px-2 py-1"><Check size={12}/> Save</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5">
      <span className="mt-1 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }}/>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
          {index != null && <span className="text-slate-400 mr-1">#{index + 1}</span>}
          {defectLabel(finding.defect_type)} <span className="font-normal text-slate-500">· {severityLabel(finding.severity)}</span>
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{findingSource(finding)}</p>
      </div>
      {editable && (
        <div className="flex shrink-0">
          <button onClick={() => { setDraft({ defect_type: finding.defect_type, severity: finding.severity }); setEditing(true); }} disabled={busy} className="btn-ghost p-1 rounded" title="Edit"><Pencil size={12}/></button>
          <button onClick={remove} disabled={busy} className="btn-ghost p-1 rounded text-red-500" title="Remove"><Trash2 size={12}/></button>
        </div>
      )}
    </div>
  );
}

export function FindingList({ findings, editable, onChanged, onRemoved, emptyText }) {
  if (!findings.length) return emptyText ? <p className="text-[11px] text-slate-400">{emptyText}</p> : null;
  return (
    <div className="space-y-1">
      {findings.map((f, i) => (
        <FindingItem key={f.id} finding={f} index={i} editable={editable} onChanged={onChanged} onRemoved={onRemoved}/>
      ))}
    </div>
  );
}

export function ScanAllButton({ photos, countFor, scanner, disabled, label = "Scan all" }) {
  const { progress, busy, scanMany } = scanner;
  return (
    <button onClick={() => scanMany(photos, countFor)} disabled={disabled || busy || photos.length === 0} className="btn-primary text-xs px-3 py-1.5">
      {progress
        ? <><Loader2 size={13} className="animate-spin"/> Scanning {progress.done + 1} of {progress.total}</>
        : <><Scan size={13}/> {label}</>}
    </button>
  );
}
