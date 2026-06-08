import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, ArrowLeft, Send, Lock,
  Sparkles, ChevronDown, ChevronUp,
  FileDown, File, Loader2, AlertTriangle, CheckCircle,
  Building2, Calendar, User, MapPin, Cloud, Layers, Pencil,
} from "lucide-react";
import api from "../../api/axios.js";
import { useAuth } from "../../context/AuthContext.jsx";
import toast from "react-hot-toast";
import { exportReportPdf } from "../../model/pdfGenerator.js";
import { exportReportDocx } from "../../model/docGenerator.js";

const DEFECT_COLORS = {
  crack:         "#ef4444",
  faded_paint:   "#f59e0b",
  spalling:      "#8b5cf6",
  water_stain:   "#3b82f6",
  rust:          "#b45309",
  mold:          "#16a34a",
  efflorescence: "#64748b",
};

const REMEDIATION_MAP = {
  crack:         "Apply appropriate crack filler or epoxy injection. For structural cracks, engage a licensed structural engineer for assessment. Monitor and re-inspect within 30 days.",
  faded_paint:   "Clean the surface thoroughly and apply a compatible primer followed by two coats of weather-resistant exterior paint. Ensure proper surface preparation to maximise paint adhesion and longevity.",
  spalling:      "Remove all loose and delaminated concrete using a chipping hammer. Apply a bonding agent and patch with polymer-modified repair mortar. Allow full curing before applying a protective coating.",
  water_stain:   "Identify and rectify the source of water ingress before treating the surface. Apply a waterproof sealant or membrane after drying. Inspect drainage systems, roof flashing, and pipe joints in the vicinity.",
  rust:          "Mechanically abrade corroded areas to bare metal (minimum Sa 2.5). Apply a zinc-rich rust-inhibiting primer followed by a compatible topcoat. Investigate and address the source of moisture exposure.",
  mold:          "Apply an anti-fungal biocide solution and scrub the affected surface. Allow sufficient drying time before applying a mould-resistant paint or coating. Improve ventilation and address any moisture sources to prevent recurrence.",
  efflorescence: "Dry-brush or wet-clean the affected area to remove salt deposits. Allow complete drying and apply a breathable masonry sealant to reduce moisture migration through the substrate.",
};

const SEVERITY_LABEL = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

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
      <span className="text-slate-800 dark:text-slate-200 font-medium capitalize">{value}</span>
    </div>
  );
}

function GroupRow({ group, photos, findings, rowData, onChange, locked, onAIFill, aiFilling, onAddManualFinding }) {
  const [expanded,       setExpanded]       = useState(true);
  const [editingName,    setEditingName]     = useState(false);
  const [nameInput,      setNameInput]       = useState(rowData?.group_name || "");
  const [showDefectPicker, setShowDefectPicker] = useState(false);
  const [pickerType,     setPickerType]      = useState("crack");
  const [pickerSeverity, setPickerSeverity]  = useState("medium");
  const [addingDefect,   setAddingDefect]    = useState(false);

  const DEFECT_OPTIONS = [
    { value: "crack",         label: "Crack"         },
    { value: "faded_paint",   label: "Faded Paint"   },
    { value: "spalling",      label: "Spalling"      },
    { value: "water_stain",   label: "Water Stain"   },
    { value: "rust",          label: "Rust"           },
    { value: "mold",          label: "Mold"           },
    { value: "efflorescence", label: "Efflorescence"  },
  ];

  const SEVERITY_OPTIONS = [
    { value: "low",      label: "Low"      },
    { value: "medium",   label: "Medium"   },
    { value: "high",     label: "High"     },
    { value: "critical", label: "Critical" },
  ];

  const handleAddManualDefect = async () => {
    setAddingDefect(true);
    try {
      await onAddManualFinding(group.id, group.photoIds[0] || null, pickerType, pickerSeverity);
      setShowDefectPicker(false);
      setPickerType("crack");
      setPickerSeverity("medium");
    } finally { setAddingDefect(false); }
  };

  const groupPhotos   = group.photoIds.map(id => photos.find(p => p.id === id)).filter(Boolean);
  const groupFindings = findings.filter(f => group.photoIds.includes(f.photo_id));
  const hasAnnotation = !!group.annotation?.canvas_data;
  const displayName = rowData?.group_name || group.name || ("Group " + group.label);

  const photoIndexMap = {};
  groupPhotos.forEach((photo, pIdx) => { photoIndexMap[photo.id] = pIdx + 1; });

  const numberedFindings = groupFindings.map((f, fi) => {
    const pNum = f.photo_id && photoIndexMap[f.photo_id]
      ? group.label + "." + photoIndexMap[f.photo_id]
      : group.label + "." + (fi + 1);
    return { ...f, photoNum: pNum };
  });

  const autoFindings = numberedFindings.map(f =>
    "• [Photo " + f.photoNum + "] " + (f.defect_type || "").replace(/_/g, " ") +
    " (" + (SEVERITY_LABEL[f.severity] || f.severity) + "): Confidence " + Math.round((f.confidence || 0) * 100) + "%"
  ).join("\n");

  const autoRemediation = [...new Set(groupFindings.map(f => f.defect_type))]
    .map(dt => REMEDIATION_MAP[dt] ? (dt.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase()) + ":\n" + REMEDIATION_MAP[dt]) : null)
    .filter(Boolean)
    .join("\n\n");

  const commitName = () => {
    const trimmed = nameInput.trim() || ("Group " + group.label);
    setEditingName(false);
    onChange(group.id, "group_name", trimmed);
    api.patch("/groups/group/" + group.id, { name: trimmed }).catch(() => {});
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="w-7 h-7 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
          {group.label}
        </span>

        {editingName ? (
          <input
            autoFocus
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => { if (e.key === "Enter") commitName(); if (e.key === "Escape") setEditingName(false); }}
            onClick={e => e.stopPropagation()}
            className="flex-1 bg-white dark:bg-slate-900 border border-primary-400 rounded-lg px-2 py-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-primary-500"
          />
        ) : (
          <span className="font-semibold text-sm text-slate-700 dark:text-slate-200 flex-1 flex items-center gap-2">
            {displayName}
            {!locked && (
              <button
                onClick={e => { e.stopPropagation(); setNameInput(rowData?.group_name || ""); setEditingName(true); }}
                className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-primary-600 transition-colors"
                title="Rename group"
              >
                <Pencil size={11}/>
              </button>
            )}
          </span>
        )}

        <span className="text-xs text-slate-400 shrink-0">
          {groupPhotos.length} photo{groupPhotos.length !== 1 ? "s" : ""}
          {hasAnnotation && " · annotated"}
          {groupFindings.length > 0 && " · " + groupFindings.length + " finding" + (groupFindings.length !== 1 ? "s" : "")}
        </span>

        {!locked && (
          <button
            onClick={e => { e.stopPropagation(); onAIFill(group.id, autoFindings, autoRemediation); }}
            disabled={aiFilling || groupFindings.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors disabled:opacity-40 shrink-0"
            title={groupFindings.length === 0 ? "No AI findings to autofill" : "AI autofill from scan results"}
          >
            {aiFilling ? <Loader2 size={11} className="animate-spin"/> : <Sparkles size={11}/>}
            AI Autofill
          </button>
        )}
        {expanded ? <ChevronUp size={15} className="text-slate-400 shrink-0"/> : <ChevronDown size={15} className="text-slate-400 shrink-0"/>}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800">
              <div className="p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Photographs</p>
                {hasAnnotation ? (
                  <div className="rounded-xl overflow-hidden border border-emerald-200 dark:border-emerald-800">
                    <img src={group.annotation.canvas_data} alt="annotated" className="w-full object-contain bg-slate-950 max-h-56"/>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 text-center py-1 bg-emerald-50 dark:bg-emerald-900/20">
                      Annotated canvas — {displayName}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {groupPhotos.map((photo, idx) => (
                      <div key={photo.id} className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 relative">
                        <img src={photo.url} alt={"photo " + (idx + 1)} className="w-full aspect-video object-cover"/>
                        <span className="absolute top-1 left-1 text-[9px] font-bold bg-black/60 text-white px-1.5 py-0.5 rounded-full">
                          {group.label}.{idx + 1}
                        </span>
                      </div>
                    ))}
                    {groupPhotos.length === 0 && (
                      <p className="col-span-2 text-xs text-slate-400 text-center py-4">No photos in this group</p>
                    )}
                  </div>
                )}

                {numberedFindings.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">AI Detections</p>
                    {numberedFindings.map((f, i) => (
                      <div key={f.id || i} className="rounded-lg overflow-hidden border border-black/10">
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-black/30">
                          <span className="text-[10px] font-bold text-white/70 uppercase tracking-wide">Photo</span>
                          <span className="text-[11px] font-black text-white bg-white/20 px-1.5 py-0.5 rounded-md leading-none">{f.photoNum}</span>
                        </div>
                        <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-white" style={{ background: DEFECT_COLORS[f.defect_type] || "#6366f1" }}>
                          <span className="font-semibold capitalize flex-1">{(f.defect_type || "").replace(/_/g, " ")}</span>
                          <span className="opacity-80">{SEVERITY_LABEL[f.severity] || f.severity}</span>
                          {f.confidence && <span className="opacity-70">{Math.round(f.confidence * 100)}%</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!locked && (
                  <div className="pt-1">
                    {!showDefectPicker ? (
                      <button
                        onClick={() => setShowDefectPicker(true)}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-400 hover:border-primary-400 hover:text-primary-600 dark:hover:border-primary-500 dark:hover:text-primary-400 transition-colors"
                      >
                        <span className="text-base leading-none">+</span> Log defect manually
                      </button>
                    ) : (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
                          <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Log Defect</p>
                          <button onClick={() => setShowDefectPicker(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs">✕</button>
                        </div>
                        <div className="p-3 space-y-2.5">
                          <div>
                            <label className="text-[10px] text-slate-400 mb-1 block uppercase tracking-wide">Defect Type</label>
                            <div className="grid grid-cols-2 gap-1">
                              {DEFECT_OPTIONS.map(o => (
                                <button
                                  key={o.value}
                                  onClick={() => setPickerType(o.value)}
                                  className={"px-2 py-1.5 rounded-lg text-xs font-semibold text-left transition-all " + (
                                    pickerType === o.value
                                      ? "text-white"
                                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                                  )}
                                  style={pickerType === o.value ? { background: DEFECT_COLORS[o.value] } : {}}
                                >
                                  {o.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 mb-1 block uppercase tracking-wide">Severity</label>
                            <div className="flex gap-1">
                              {SEVERITY_OPTIONS.map(o => (
                                <button
                                  key={o.value}
                                  onClick={() => setPickerSeverity(o.value)}
                                  className={"flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all " + (
                                    pickerSeverity === o.value
                                      ? "bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900"
                                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                                  )}
                                >
                                  {o.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <button
                            onClick={handleAddManualDefect}
                            disabled={addingDefect}
                            className="w-full py-2 rounded-lg text-xs font-semibold text-white transition-colors"
                            style={{ background: DEFECT_COLORS[pickerType] || "#6366f1" }}
                          >
                            {addingDefect ? "Adding…" : "Add to Database"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Findings & Remediation</p>
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">Observed Defects & Findings</label>
                  <textarea
                    value={rowData?.findings_text || ""}
                    onChange={e => onChange(group.id, "findings_text", e.target.value)}
                    disabled={locked}
                    className="input resize-none text-sm w-full"
                    rows={5}
                    placeholder={"Describe the observed defects, their location, extent, and condition for " + displayName + "…"}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">Recommended Remediation Works</label>
                  <textarea
                    value={rowData?.remediation || ""}
                    onChange={e => onChange(group.id, "remediation", e.target.value)}
                    disabled={locked}
                    className="input resize-none text-sm w-full"
                    rows={6}
                    placeholder="Detail the corrective actions, materials, and procedures required to address the identified defects…"
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

export default function ReportView() {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const { user }    = useAuth();

  const [report,     setReport]     = useState(null);
  const [inspection, setInspection] = useState(null);
  const [findings,   setFindings]   = useState([]);
  const [photos,     setPhotos]     = useState([]);
  const [groups,     setGroups]     = useState([]);
  const [creator,    setCreator]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [exporting,  setExporting]  = useState(null);
  const [aiFilling,  setAiFilling]  = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const [header, setHeader] = useState({ title: "", summary: "", recommendations: "" });
  const [rows,   setRows]   = useState({});

  const locked = report ? (report.status === "published" || (isLocked(report.created_at) && user?.role !== "admin")) : false;

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
    }).catch(() => { toast.error("Failed to load report"); navigate("/inspector/reports"); })
      .finally(() => setLoading(false));
  }, [id]);

  const handleRowChange = (groupId, field, value) => {
    setRows(prev => ({ ...prev, [groupId]: { ...(prev[groupId] || {}), [field]: value } }));
  };

  const handleAIFill = (groupId, autoFindings, autoRemediation) => {
    setAiFilling(true);
    setTimeout(() => {
      setRows(prev => ({
        ...prev,
        [groupId]: {
          ...(prev[groupId] || {}),
          findings_text: prev[groupId]?.findings_text || autoFindings,
          remediation:   prev[groupId]?.remediation   || autoRemediation,
        },
      }));
      setAiFilling(false);
      toast.success("AI autofill applied");
    }, 600);
  };

  const handleAddManualFinding = async (groupId, photoId, defectType, severity) => {
    try {
      const res = await api.post("/findings/", {
        inspection_id: inspection.id,
        defect_type:   defectType,
        severity:      severity,
        confidence:    null,
        photo_id:      photoId,
        notes:         "Manually logged",
        status:        "open",
      });
      setFindings(prev => [...prev, res.data]);
      toast.success("Defect logged to database");
    } catch { toast.error("Failed to log defect"); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put("/reports/" + id, {
        title:           header.title,
        summary:         header.summary,
        recommendations: header.recommendations,
        row_data:        rows,
      });
      toast.success("Report saved");
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  const buildExportPayload = () => ({
    report, inspection, findings, photos, groups, creator, header, rows,
  });

  const handleExport = async (format) => {
    setExporting(format);
    setShowExport(false);
    try {
      if (format === "pdf") await exportReportPdf(buildExportPayload());
      else                  await exportReportDocx(buildExportPayload());
      toast.success("Exported as " + format.toUpperCase());
    } catch (e) {
      console.error(e);
      toast.error("Export failed: " + e.message);
    } finally { setExporting(null); }
  };

  const handlePublish = async () => {
    setSaving(true);
    try {
      await api.put("/reports/" + id, {
        title:           header.title,
        summary:         header.summary,
        recommendations: header.recommendations,
        row_data:        rows,
      });
    } catch { toast.error("Failed to save before publishing"); setSaving(false); return; }
    setSaving(false);

    try {
      await api.post("/reports/" + id + "/publish");
      setReport(prev => ({ ...prev, status: "published" }));
      toast.success("Report published!");
      setShowExportModal(true);
    } catch { toast.error("Failed to publish"); }
  };

  const handleExportChoice = async (format) => {
    setShowExportModal(false);
    if (format) {
      setExporting(format);
      try {
        if (format === "pdf")  await exportReportPdf(buildExportPayload());
        else                   await exportReportDocx(buildExportPayload());
        toast.success("Exported as " + format.toUpperCase());
      } catch (e) {
        toast.error("Export failed: " + e.message);
      } finally { setExporting(null); }
    }
    navigate("/inspector/reports");
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"/>
    </div>
  );

  if (!report) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="page-header">
        <button onClick={() => navigate("/inspector/reports")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-600 mb-3 transition-colors">
          <ArrowLeft size={15}/> Back to Reports
        </button>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="page-title">{report.title}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={report.status === "published" ? "badge-green" : "badge-gray"}>{report.status}</span>
              {locked && (
                <span className="flex items-center gap-1 text-xs text-amber-500 font-medium">
                  <Lock size={11}/> Locked — reports cannot be edited after 3 days
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {locked && (
        <motion.div
          className="card p-4 flex items-center gap-3 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20"
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        >
          <Lock size={16} className="text-amber-600 shrink-0"/>
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {report?.status === "published"
              ? "This report has been published and is now read-only. Download a copy using the Export button below."
              : "This report was created more than 3 days ago and is now locked. Contact an administrator if edits are required."}
          </p>
        </motion.div>
      )}

      <motion.div className="card p-5 space-y-3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
          <Building2 size={15} className="text-primary-600"/> Inspection Details
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
          <InfoRow label="Inspection Title"  value={inspection?.title}                       icon={FileText}/>
          <InfoRow label="Building"          value={inspection?.buildings?.name}             icon={Building2}/>
          <InfoRow label="Building Code"     value={inspection?.buildings?.code}             icon={Layers}/>
          <InfoRow label="Inspection Date"   value={inspection?.inspection_date}             icon={Calendar}/>
          <InfoRow label="Weather"           value={inspection?.weather_condition}           icon={Cloud}/>
          <InfoRow label="Floor Level"       value={inspection?.floor_level}                icon={Layers}/>
          <InfoRow label="Area Inspected"    value={inspection?.area_inspected}             icon={MapPin}/>
          <InfoRow label="Prepared By"       value={creator?.name}                          icon={User}/>
          <InfoRow label="Report Date"       value={new Date(report.created_at).toLocaleDateString("en-MY", { year:"numeric", month:"long", day:"numeric" })} icon={Calendar}/>
          <InfoRow label="Status"            value={report.status}/>
        </div>
        {inspection?.description && (
          <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-400 mb-1">Site Remarks</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">{inspection.description}</p>
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
          <label className="label">Executive Summary</label>
          <textarea value={header.summary} onChange={e => setHeader(h => ({...h, summary: e.target.value}))} disabled={locked} className="input resize-none" rows={4} placeholder="Provide an overall assessment of the building's condition, scope of inspection, and key findings…"/>
        </div>
        <div>
          <label className="label">General Recommendations</label>
          <textarea value={header.recommendations} onChange={e => setHeader(h => ({...h, recommendations: e.target.value}))} disabled={locked} className="input resize-none" rows={3} placeholder="Summarise the priority remediation actions and maintenance schedule…"/>
        </div>
      </motion.div>

      <motion.div className="space-y-3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-500"/>
            Findings & Remediation Table
            <span className="text-xs text-slate-400 font-normal">
              ({groups.length} group{groups.length !== 1 ? "s" : ""} · {findings.length} finding{findings.length !== 1 ? "s" : ""})
            </span>
          </h2>
          {!locked && (
            <button
              onClick={() => {
                groups.forEach(g => {
                  const gf   = findings.filter(f => g.photoIds.includes(f.photo_id));
                  const gph  = g.photoIds.map(id => photos.find(p => p.id === id)).filter(Boolean);
                  const pMap = {};
                  gph.forEach((ph, i) => { pMap[ph.id] = i + 1; });
                  const numbered = gf.map((f, fi) => ({
                    ...f,
                    photoNum: f.photo_id && pMap[f.photo_id] ? g.label + "." + pMap[f.photo_id] : g.label + "." + (fi + 1),
                  }));
                  const autoF = numbered.map(f =>
                    "• [Photo " + f.photoNum + "] " + (f.defect_type || "").replace(/_/g, " ") +
                    " (" + (SEVERITY_LABEL[f.severity] || f.severity) + "): Confidence " + Math.round((f.confidence || 0) * 100) + "%"
                  ).join("\n");
                  const autoR = [...new Set(gf.map(f => f.defect_type))].map(dt => REMEDIATION_MAP[dt] ? (dt.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase()) + ":\n" + REMEDIATION_MAP[dt]) : null).filter(Boolean).join("\n\n");
                  handleAIFill(g.id, autoF, autoR);
                });
              }}
              disabled={aiFilling || findings.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors disabled:opacity-40"
            >
              {aiFilling ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>}
              AI Autofill All Groups
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
                findings={findings}
                rowData={rows[g.id]}
                onChange={handleRowChange}
                locked={locked}
                onAIFill={handleAIFill}
                aiFilling={aiFilling}
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Findings",  value: findings.length,                                                               color: "text-primary-600" },
            { label: "High Severity",   value: findings.filter(f => f.severity === "high" || f.severity === "critical").length, color: "text-red-500"     },
            { label: "Medium Severity", value: findings.filter(f => f.severity === "medium").length,                           color: "text-amber-500"   },
            { label: "Low Severity",    value: findings.filter(f => f.severity === "low").length,                              color: "text-emerald-500" },
          ].map(s => (
            <div key={s.label} className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-center">
              <p className={"text-2xl font-bold " + s.color}>{s.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
        {findings.length > 0 && (
          <div className="pt-1">
            <p className="text-xs text-slate-400 mb-2">Defect Breakdown</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(
                findings.reduce((acc, f) => { acc[f.defect_type] = (acc[f.defect_type] || 0) + 1; return acc; }, {})
              ).map(([type, count]) => (
                <span key={type} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ background: DEFECT_COLORS[type] || "#6366f1" }}>
                  {type.replace(/_/g, " ")} × {count}
                </span>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {locked && report?.status === "published" && (
        <div className="flex justify-end gap-2 pb-2">
          <div className="relative">
            <button
              onClick={() => setShowExport(s => !s)}
              disabled={!!exporting}
              className="btn-secondary flex items-center gap-2"
            >
              {exporting ? <Loader2 size={14} className="animate-spin"/> : <FileDown size={14}/>}
              {exporting ? "Exporting…" : "Export Report"}
              <ChevronDown size={13}/>
            </button>
            <AnimatePresence>
              {showExport && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 z-20 overflow-hidden"
                >
                  <button onClick={() => { setShowExport(false); handleExport("pdf"); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <FileDown size={14} className="text-red-500"/> Download PDF
                  </button>
                  <button onClick={() => { setShowExport(false); handleExport("docx"); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <File size={14} className="text-blue-500"/> Download Word
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {!locked && report?.status === "draft" && (
        <div className="flex justify-end pb-6">
          <button onClick={handlePublish} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}
            {saving ? "Saving…" : "Publish Report"}
          </button>
        </div>
      )}

      <AnimatePresence>
        {showExportModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
            >
              <div className="p-6 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle size={24} className="text-emerald-600"/>
                </div>
                <h2 className="font-bold text-slate-900 dark:text-white text-lg">Report Published!</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Would you like to download a copy before returning to Reports?</p>
              </div>
              <div className="px-6 pb-6 space-y-2">
                <button
                  onClick={() => handleExportChoice("pdf")}
                  disabled={!!exporting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                >
                  {exporting === "pdf" ? <Loader2 size={14} className="animate-spin"/> : <FileDown size={14}/>}
                  Download PDF
                </button>
                <button
                  onClick={() => handleExportChoice("docx")}
                  disabled={!!exporting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold text-sm hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                >
                  {exporting === "docx" ? <Loader2 size={14} className="animate-spin"/> : <File size={14}/>}
                  Download Word
                </button>
                <button
                  onClick={() => handleExportChoice(null)}
                  className="w-full py-2.5 rounded-xl text-slate-500 dark:text-slate-400 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
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