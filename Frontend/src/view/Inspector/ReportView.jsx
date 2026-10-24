import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, ArrowLeft, Send, Lock, Save, Eye, X,
  Sparkles, ChevronDown, ChevronUp,
  FileDown, File, Loader2, AlertTriangle, CheckCircle,
  Building2, Calendar, User, MapPin, Cloud, Layers, Pencil, Hash,
} from "lucide-react";
import api from "../../api/axios.js";
import { useAuth } from "../../context/auth.js";
import toast from "react-hot-toast";
import { apiErrorText } from "../../utils/apiError.js";
import { exportReport } from "../../report/exportReport.js";
import { buildReportModel, prepareImages } from "../../report/reportModel.js";
import ReportDocument from "../../report/ReportDocument.jsx";
import { DEFECT_COLORS, DEFECT_TYPES, RECOMMENDED_ACTION, SEVERITIES, capitalise, defectLabel, findingSource, findingsByPhoto, severityLabel } from "../../utils/findings.js";
import { fmtDate } from "../../utils/reportFormat.js";
import { usePhotoScanner } from "../../utils/usePhotoScan.js";
import { FindingList, PhotoWithBoxes, ScanAllButton, ScanButton, ScanStatus } from "../../components/PhotoScan.jsx";

const NONE = [];

const isLocked = (created_at) => {
  if (!created_at) return false;
  return (Date.now() - new Date(created_at).getTime()) / (1000 * 60 * 60 * 24) >= 3;
};

function InfoRow({ label, value, icon: Icon }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      {Icon && <Icon size={14} className="text-slate-400 mt-0.5 shrink-0"/>}
      <span className="text-slate-500 dark:text-slate-400 shrink-0 w-28">{label}</span>
      <span className="text-slate-800 dark:text-slate-200 font-medium break-words min-w-0">{value}</span>
    </div>
  );
}

function autofillText(group, groupPhotos, byPhoto) {
  const lines = [];
  groupPhotos.forEach((photo, i) => {
    (byPhoto[photo.id] || NONE).forEach(f => {
      lines.push(`- Photo ${group.label}.${i + 1}: ${defectLabel(f.defect_type)} (${severityLabel(f.severity)}), ${findingSource(f)}`);
    });
  });
  const types = [...new Set(groupPhotos.flatMap(p => (byPhoto[p.id] || NONE).map(f => f.defect_type)))];
  const remediation = types.map(t => `${defectLabel(t)}: ${RECOMMENDED_ACTION[t] || "Inspect and repair as required."}`).join("\n\n");
  return { findings: lines.join("\n"), remediation };
}

function GroupRow({ group, photos, byPhoto, rowData, onChange, locked, canEditFindings, scanner, onAutofill, onFindingChanged, onFindingRemoved, onAddManualFinding }) {
  const [expanded,    setExpanded]    = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameInput,   setNameInput]   = useState(rowData?.group_name || "");
  const [picker,      setPicker]      = useState(null);
  const [adding,      setAdding]      = useState(false);

  const groupPhotos   = group.photoIds.map(id => photos.find(p => p.id === id)).filter(Boolean);
  const findingCount  = groupPhotos.reduce((s, p) => s + (byPhoto[p.id] || NONE).length, 0);
  const hasAnnotation = !!group.annotation?.canvas_data;
  const displayName   = rowData?.group_name || group.name || ("Group " + group.label);

  const commitName = () => {
    const trimmed = nameInput.trim() || ("Group " + group.label);
    setEditingName(false);
    onChange(group.id, "group_name", trimmed);
    api.patch("/groups/group/" + group.id, { name: trimmed }).catch(() => {});
  };

  const addManual = async () => {
    setAdding(true);
    try {
      await onAddManualFinding(picker.photoId, picker.type, picker.severity);
      setPicker(null);
    } finally { setAdding(false); }
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
      <div className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 flex-wrap">
        <span className="w-7 h-7 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{group.label}</span>
        {editingName ? (
          <input
            autoFocus
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => { if (e.key === "Enter") commitName(); if (e.key === "Escape") setEditingName(false); }}
            className="flex-1 bg-white dark:bg-slate-900 border border-primary-400 rounded-lg px-2 py-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-primary-500"
          />
        ) : (
          <span className="font-semibold text-sm text-slate-700 dark:text-slate-200 flex-1 flex items-center gap-2 min-w-0">
            <span className="truncate">{displayName}</span>
            {!locked && (
              <button onClick={() => { setNameInput(rowData?.group_name || ""); setEditingName(true); }} className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-primary-600 transition-colors" title="Rename group">
                <Pencil size={11}/>
              </button>
            )}
          </span>
        )}
        <span className="text-xs text-slate-400 shrink-0">
          {groupPhotos.length} photo{groupPhotos.length !== 1 ? "s" : ""}
          {hasAnnotation && ", annotated"}
          {findingCount > 0 && `, ${findingCount} finding${findingCount !== 1 ? "s" : ""}`}
        </span>
        {canEditFindings && (
          <ScanAllButton photos={groupPhotos} countFor={id => (byPhoto[id] || NONE).length} scanner={scanner} label="Scan all"/>
        )}
        {!locked && (
          <button
            onClick={() => onAutofill(group, groupPhotos)}
            disabled={findingCount === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors disabled:opacity-40 shrink-0"
            title={findingCount === 0 ? "No findings to fill in from" : "Fill the text boxes from the findings"}
          >
            <Sparkles size={11}/> Autofill from findings
          </button>
        )}
        <button onClick={() => setExpanded(e => !e)} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700" title={expanded ? "Collapse" : "Expand"}>
          {expanded ? <ChevronUp size={15} className="text-slate-400"/> : <ChevronDown size={15} className="text-slate-400"/>}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800">
              <div className="p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Photographs and findings</p>
                {hasAnnotation && (
                  <div className="rounded-xl overflow-hidden border border-emerald-200 dark:border-emerald-800">
                    <img src={group.annotation.canvas_data} alt="annotated" className="w-full object-contain bg-white max-h-56"/>
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-400 text-center py-1 bg-emerald-50 dark:bg-emerald-900/20">
                      Annotated view. The AI scans the original photos below, one by one.
                    </p>
                  </div>
                )}
                {groupPhotos.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No photos in this group</p>}
                {groupPhotos.map((photo, idx) => {
                  const pf = byPhoto[photo.id] || NONE;
                  return (
                    <div key={photo.id} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <PhotoWithBoxes photo={photo} findings={pf} className="aspect-video bg-slate-100 dark:bg-slate-800">
                        <span className="absolute top-1 left-1 text-[10px] font-bold bg-white/90 text-slate-800 px-1.5 py-0.5 rounded-full shadow">{group.label}.{idx + 1}</span>
                      </PhotoWithBoxes>
                      <div className="p-2 space-y-1.5">
                        <ScanStatus photo={photo} findings={pf} scanning={!!scanner.scanning[photo.id]} failed={scanner.failed[photo.id]}/>
                        <FindingList findings={pf} editable={canEditFindings} onChanged={onFindingChanged} onRemoved={onFindingRemoved}/>
                        {canEditFindings && (
                          <ScanButton photo={photo} scanning={!!scanner.scanning[photo.id]} failed={scanner.failed[photo.id]} disabled={!!scanner.progress}
                            onScan={() => scanner.scanPhoto(photo, pf.length)}/>
                        )}
                      </div>
                    </div>
                  );
                })}

                {canEditFindings && groupPhotos.length > 0 && (
                  picker ? (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Log a finding manually</p>
                        <button onClick={() => setPicker(null)} className="text-slate-400 hover:text-slate-600"><X size={13}/></button>
                      </div>
                      <select value={picker.photoId} onChange={e => setPicker(p => ({ ...p, photoId: e.target.value }))} className="input text-xs py-1.5">
                        {groupPhotos.map((p, i) => <option key={p.id} value={p.id}>Photo {group.label}.{i + 1}</option>)}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <select value={picker.type} onChange={e => setPicker(p => ({ ...p, type: e.target.value }))} className="input text-xs py-1.5">
                          {DEFECT_TYPES.map(t => <option key={t} value={t}>{defectLabel(t)}</option>)}
                        </select>
                        <select value={picker.severity} onChange={e => setPicker(p => ({ ...p, severity: e.target.value }))} className="input text-xs py-1.5">
                          {SEVERITIES.map(s => <option key={s} value={s}>{severityLabel(s)}</option>)}
                        </select>
                      </div>
                      <button onClick={addManual} disabled={adding} className="btn-primary w-full text-xs py-1.5 justify-center">{adding ? "Adding..." : "Add finding"}</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setPicker({ photoId: groupPhotos[0].id, type: "crack", severity: "medium" })}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-400 hover:border-primary-400 hover:text-primary-600 transition-colors"
                    >
                      + Log a finding manually
                    </button>
                  )
                )}
              </div>

              <div className="p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Findings and Remediation</p>
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">Observed defects</label>
                  <textarea
                    value={rowData?.findings_text || ""}
                    onChange={e => onChange(group.id, "findings_text", e.target.value)}
                    disabled={locked}
                    className="input resize-none text-sm w-full"
                    rows={5}
                    placeholder={"Describe the observed defects, their location, extent and condition for " + displayName}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">Recommended works</label>
                  <textarea
                    value={rowData?.remediation || ""}
                    onChange={e => onChange(group.id, "remediation", e.target.value)}
                    disabled={locked}
                    className="input resize-none text-sm w-full"
                    rows={6}
                    placeholder="Detail the corrective actions, materials and procedures required"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DocumentPreview({ payload, onClose }) {
  const [model, setModel] = useState(null);
  useEffect(() => {
    let live = true;
    prepareImages(buildReportModel(payload)).then(m => { if (live) setModel(m); });
    return () => { live = false; };
  }, [payload]);
  return (
    <motion.div className="fixed inset-0 z-50 bg-slate-900/80 overflow-auto p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="max-w-[860px] mx-auto">
        <div className="flex justify-end mb-3">
          <button onClick={onClose} className="btn-secondary"><X size={15}/> Close preview</button>
        </div>
        {model ? <ReportDocument model={model}/> : (
          <div className="flex items-center justify-center h-64 text-white gap-2"><Loader2 className="animate-spin"/> Preparing the document</div>
        )}
      </div>
    </motion.div>
  );
}

export default function ReportView() {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const { user, hasRole } = useAuth();
  const location    = useLocation();
  const backTo      = location.state?.from || (hasRole("inspector") ? "/reports" : "/all-reports");

  const [report,     setReport]     = useState(null);
  const [inspection, setInspection] = useState(null);
  const [findings,   setFindings]   = useState([]);
  const [photos,     setPhotos]     = useState([]);
  const [groups,     setGroups]     = useState([]);
  const [creator,    setCreator]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [exporting,  setExporting]  = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [preview,    setPreview]    = useState(null);

  const [header, setHeader] = useState({ title: "", summary: "", recommendations: "" });
  const [rows,   setRows]   = useState({});

  const isMine = report?.created_by === user?.id;
  const locked = report ? (!isMine || report.status === "published" || isLocked(report.created_at)) : false;
  const canEditFindings = !locked && !!inspection && inspection.inspector_id === user?.id && hasRole("inspector") && !inspection.severity;
  const byPhoto = useMemo(() => findingsByPhoto(findings), [findings]);

  const onScanned = useCallback((photoId, result) => {
    setFindings(prev => [...prev.filter(f => f.photo_id !== photoId), ...(result.findings || [])]);
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, scanned_at: result.scanned_at } : p));
  }, []);
  const scanner = usePhotoScanner({ onScanned });
  const onFindingChanged = useCallback((row) => setFindings(prev => prev.map(f => f.id === row.id ? { ...f, ...row } : f)), []);
  const onFindingRemoved = useCallback((fid) => setFindings(prev => prev.filter(f => f.id !== fid)), []);

  useEffect(() => {
    setLoading(true);
    api.get("/reports/" + id + "/export").then(r => {
      const { report: rep, inspection: insp, findings: fnd, photos: ph, groups: grp, creator: cr } = r.data;
      setReport(rep);
      setInspection(insp);
      setFindings(fnd);
      setPhotos(ph);
      setGroups(grp);
      setCreator(cr);
      setHeader({ title: rep.title || "", summary: rep.summary || "", recommendations: rep.recommendations || "" });
      const existingRows = {};
      if (rep.row_data && typeof rep.row_data === "object") {
        Object.assign(existingRows, rep.row_data);
      } else if (rep.row_data && typeof rep.row_data === "string") {
        try { Object.assign(existingRows, JSON.parse(rep.row_data)); } catch {}
      }
      setRows(existingRows);
    }).catch((e) => { toast.error(apiErrorText(e, "Failed to load report")); navigate(backTo); })
      .finally(() => setLoading(false));
  }, [id, backTo, navigate]);

  const handleRowChange = (groupId, field, value) => {
    setRows(prev => ({ ...prev, [groupId]: { ...(prev[groupId] || {}), [field]: value } }));
  };

  const fillGroup = (group, groupPhotos, overwrite) => {
    const auto = autofillText(group, groupPhotos, byPhoto);
    setRows(prev => {
      const current = prev[group.id] || {};
      return {
        ...prev,
        [group.id]: {
          ...current,
          findings_text: overwrite || !current.findings_text ? auto.findings : current.findings_text,
          remediation:   overwrite || !current.remediation ? auto.remediation : current.remediation,
        },
      };
    });
  };

  const handleAutofill = (group, groupPhotos) => {
    const current = rows[group.id] || {};
    const overwrite = !!(current.findings_text || current.remediation) && confirm("Replace the text you already wrote for this group with text built from its findings?");
    fillGroup(group, groupPhotos, overwrite);
    toast.success("Filled in from findings");
  };

  const handleAutofillAll = () => {
    groups.forEach(g => fillGroup(g, g.photoIds.map(pid => photos.find(p => p.id === pid)).filter(Boolean), false));
    toast.success("Empty boxes filled in from findings");
  };

  const handleAddManualFinding = async (photoId, defectType, severity) => {
    try {
      const res = await api.post("/findings/", { inspection_id: inspection.id, defect_type: defectType, severity, photo_id: photoId });
      setFindings(prev => [...prev, res.data]);
      toast.success("Finding logged");
    } catch (e) { toast.error(apiErrorText(e, "Failed to log finding")); }
  };

  const saveReport = () => api.put("/reports/" + id, {
    title:           header.title,
    summary:         header.summary,
    recommendations: header.recommendations,
    row_data:        rows,
  });

  const handleSave = async () => {
    setSaving(true);
    try { await saveReport(); toast.success("Report saved"); }
    catch (e) { toast.error(apiErrorText(e, "Save failed")); }
    finally { setSaving(false); }
  };

  const buildExportPayload = () => ({ report, inspection, findings, photos, groups, creator, header, rows });

  const runExport = async (format) => {
    setExporting(format);
    try {
      await exportReport(format, buildExportPayload());
      toast.success("Exported as " + (format === "pdf" ? "PDF" : "Word"));
    } catch (e) {
      console.error(e);
      toast.error(apiErrorText(e, `Export failed: ${e.message}`));
    } finally { setExporting(null); }
  };

  const handlePublish = async () => {
    setSaving(true);
    try { await saveReport(); }
    catch (e) { toast.error(apiErrorText(e, "Failed to save before publishing")); setSaving(false); return; }
    setSaving(false);
    try {
      await api.post("/reports/" + id + "/publish");
      setReport(prev => ({ ...prev, status: "published" }));
      toast.success("Report published");
      setShowExportModal(true);
    } catch (e) { toast.error(apiErrorText(e, "Failed to publish")); }
  };

  const handleExportChoice = async (format) => {
    setShowExportModal(false);
    if (format) await runExport(format);
    navigate(backTo);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"/>
    </div>
  );

  if (!report) return null;

  const severityCounts = SEVERITIES.map(s => [s, findings.filter(f => f.severity === s).length]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="page-header">
        <button onClick={() => navigate(backTo)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-600 mb-3 transition-colors">
          <ArrowLeft size={15}/> Back
        </button>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="page-title">{report.title}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={report.status === "published" ? "badge-green" : "badge-gray"}>{capitalise(report.status)}</span>
              {inspection?.reference && <span className="text-xs font-mono text-slate-500">{inspection.reference}</span>}
              {!isMine && creator?.name && <span className="text-xs text-slate-400">by {creator.name}</span>}
              {locked && isMine && (
                <span className="flex items-center gap-1 text-xs text-amber-500 font-medium">
                  <Lock size={11}/> Read only
                </span>
              )}
            </div>
          </div>
          <button onClick={() => setPreview(buildExportPayload())} className="btn-secondary"><Eye size={14}/> Preview document</button>
        </div>
      </div>

      {locked && (
        <motion.div className="card p-4 flex items-center gap-3 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Lock size={16} className="text-amber-600 shrink-0"/>
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {!isMine
              ? "This report belongs to another inspector and is read-only for you."
              : report?.status === "published"
                ? "This report has been published and is now read-only. Download a copy using the Export button below."
                : "This report was created more than 3 days ago and is now locked."}
          </p>
        </motion.div>
      )}

      {!locked && inspection?.severity && (
        <div className="card p-3 text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
          <Lock size={14} className="text-slate-400"/> A facility manager has reviewed this inspection, so its findings are read only. You can still edit the report text.
        </div>
      )}

      <motion.div className="card p-5 space-y-3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
          <Building2 size={15} className="text-primary-600"/> Inspection Details
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
          <InfoRow label="Inspection No."  value={inspection?.reference}                 icon={Hash}/>
          <InfoRow label="Complaint No."   value={inspection?.complaint_reference}       icon={Hash}/>
          <InfoRow label="Inspection Title" value={inspection?.title}                    icon={FileText}/>
          <InfoRow label="Building"        value={inspection?.buildings?.name}           icon={Building2}/>
          <InfoRow label="Building Code"   value={inspection?.buildings?.code}           icon={Layers}/>
          <InfoRow label="Inspection Date" value={fmtDate(inspection?.inspection_date)}  icon={Calendar}/>
          <InfoRow label="Weather"         value={capitalise(inspection?.weather_condition)} icon={Cloud}/>
          <InfoRow label="Floor Level"     value={inspection?.floor_level}               icon={Layers}/>
          <InfoRow label="Area Inspected"  value={inspection?.area_inspected}            icon={MapPin}/>
          <InfoRow label="Prepared By"     value={creator?.name}                         icon={User}/>
          <InfoRow label="Report Date"     value={fmtDate(report.created_at)}            icon={Calendar}/>
          <InfoRow label="Severity"        value={inspection?.severity ? severityLabel(inspection.severity) : "Not reviewed yet"}/>
        </div>
        {inspection?.description && (
          <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-400 mb-1">Site Remarks</p>
            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{inspection.description}</p>
          </div>
        )}
      </motion.div>

      <motion.div className="card p-5 space-y-4" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <h2 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
          <FileText size={15} className="text-primary-600"/> Report Overview
        </h2>
        <div>
          <label className="label">Report Title</label>
          <input value={header.title} onChange={e => setHeader(h => ({...h, title: e.target.value}))} disabled={locked} className="input"/>
        </div>
        <div>
          <label className="label">Summary</label>
          <textarea value={header.summary} onChange={e => setHeader(h => ({...h, summary: e.target.value}))} disabled={locked} className="input resize-none" rows={4} placeholder="Overall condition of the building, scope of the inspection and key findings"/>
        </div>
        <div>
          <label className="label">General Recommendations</label>
          <textarea value={header.recommendations} onChange={e => setHeader(h => ({...h, recommendations: e.target.value}))} disabled={locked} className="input resize-none" rows={3} placeholder="Priority repair actions and maintenance schedule"/>
        </div>
      </motion.div>

      <motion.div className="space-y-3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-500"/>
            Findings and Remediation
            <span className="text-xs text-slate-400 font-normal">
              ({groups.length} group{groups.length !== 1 ? "s" : ""}, {findings.length} finding{findings.length !== 1 ? "s" : ""})
            </span>
          </h2>
          {!locked && (
            <button
              onClick={handleAutofillAll}
              disabled={findings.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors disabled:opacity-40"
            >
              <Sparkles size={12}/> Autofill all groups from findings
            </button>
          )}
        </div>

        {groups.length === 0 ? (
          <div className="card p-8 text-center text-sm text-slate-400">
            No photo groups found. Return to the inspection to upload and group photos.
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(g => (
              <GroupRow
                key={g.id}
                group={g}
                photos={photos}
                byPhoto={byPhoto}
                rowData={rows[g.id]}
                onChange={handleRowChange}
                locked={locked}
                canEditFindings={canEditFindings}
                scanner={scanner}
                onAutofill={handleAutofill}
                onFindingChanged={onFindingChanged}
                onFindingRemoved={onFindingRemoved}
                onAddManualFinding={handleAddManualFinding}
              />
            ))}
          </div>
        )}
      </motion.div>

      <motion.div className="card p-5 space-y-3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <h2 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
          <CheckCircle size={15} className="text-emerald-500"/> Summary Statistics
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{findings.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">Total findings</p>
          </div>
          {severityCounts.map(([s, n]) => (
            <div key={s} className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{n}</p>
              <p className="text-xs text-slate-400 mt-0.5">{severityLabel(s)}</p>
            </div>
          ))}
        </div>
        {findings.length > 0 && (
          <div className="pt-1">
            <p className="text-xs text-slate-400 mb-2">Defect breakdown</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(findings.reduce((acc, f) => { acc[f.defect_type] = (acc[f.defect_type] || 0) + 1; return acc; }, {})).map(([type, count]) => (
                <span key={type} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                  <span className="w-2 h-2 rounded-full" style={{ background: DEFECT_COLORS[type] || "#6366f1" }}/>
                  {defectLabel(type)}: {count}
                </span>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      <div className="flex justify-end gap-2 pb-6 flex-wrap">
        <div className="relative">
          <button onClick={() => setShowExport(s => !s)} disabled={!!exporting} className="btn-secondary flex items-center gap-2">
            {exporting ? <Loader2 size={14} className="animate-spin"/> : <FileDown size={14}/>}
            {exporting ? "Exporting..." : "Export"}
            <ChevronDown size={13}/>
          </button>
          <AnimatePresence>
            {showExport && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 bottom-full mb-1 w-44 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 z-20 overflow-hidden"
              >
                <button onClick={() => { setShowExport(false); runExport("pdf"); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <FileDown size={14}/> Download PDF
                </button>
                <button onClick={() => { setShowExport(false); runExport("docx"); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <File size={14}/> Download Word
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {!locked && report?.status === "draft" && (
          <>
            <button onClick={handleSave} disabled={saving} className="btn-secondary flex items-center gap-2">
              <Save size={14}/> Save draft
            </button>
            <button onClick={handlePublish} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}
              {saving ? "Saving..." : "Publish Report"}
            </button>
          </>
        )}
      </div>

      <AnimatePresence>
        {preview && <DocumentPreview payload={preview} onClose={() => setPreview(null)}/>}
      </AnimatePresence>

      <AnimatePresence>
        {showExportModal && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
            >
              <div className="p-6 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle size={24} className="text-emerald-600"/>
                </div>
                <h2 className="font-bold text-slate-900 dark:text-white text-lg">Report Published</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Would you like to download a copy before returning to Reports?</p>
              </div>
              <div className="px-6 pb-6 space-y-2">
                <button onClick={() => handleExportChoice("pdf")} disabled={!!exporting} className="btn-secondary w-full justify-center">
                  {exporting === "pdf" ? <Loader2 size={14} className="animate-spin"/> : <FileDown size={14}/>} Download PDF
                </button>
                <button onClick={() => handleExportChoice("docx")} disabled={!!exporting} className="btn-secondary w-full justify-center">
                  {exporting === "docx" ? <Loader2 size={14} className="animate-spin"/> : <File size={14}/>} Download Word
                </button>
                <button onClick={() => handleExportChoice(null)} className="w-full py-2.5 rounded-xl text-slate-500 dark:text-slate-400 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  No thanks, go to Reports
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
