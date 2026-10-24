import logoUrl from "../assets/company-logo.png";
import { RECOMMENDED_ACTION, boxesFor, capitalise, defectLabel, findingSource, severityLabel } from "../utils/findings.js";
import { fmtDate } from "../utils/reportFormat.js";

export const SECTION = {
  details:  "1. Inspection Details",
  summary:  "2. Summary",
  findings: "3. Findings",
  photos:   "4. Photographs",
  review:   "5. Severity Review",
  signoff:  "6. Sign-off",
};

export const FINDING_COLUMNS = ["Photo", "Defect", "Severity", "Source", "Recommended action"];

const text = (value) => (value == null ? "" : String(value).trim());
const unique = (items) => [...new Set(items.filter(Boolean))];

function figureCaption(number, findings, location) {
  const defects = unique(findings.map(f => defectLabel(f.defect_type)));
  const what = defects.length ? defects.join(", ") : "No defects found";
  return `Figure ${number}: ${location ? `${what}, ${location}` : what}`;
}

export function buildReportModel({ report, inspection, findings, photos, groups, creator, header, rows }) {
  const insp = inspection || {};
  const building = insp.buildings || {};
  const allFindings = findings || [];
  const reportRows = rows || {};
  const photoById = Object.fromEntries((photos || []).map(p => [p.id, p]));
  const area = text(insp.area_inspected);

  const figureNo = {};
  const groupBlocks = (groups || []).map(group => {
    const rowData = reportRows[group.id] || {};
    const name = text(rowData.group_name) || text(group.name) || `Group ${group.label}`;
    const figures = (group.photoIds || []).map((id, i) => {
      const photo = photoById[id];
      if (!photo) return null;
      const number = `${group.label}.${i + 1}`;
      figureNo[id] = number;
      const photoFindings = allFindings.filter(f => f.photo_id === id);
      return {
        id,
        number,
        url: photo.url,
        boxes: boxesFor(photoFindings),
        caption: figureCaption(number, photoFindings, area),
      };
    }).filter(Boolean);
    return {
      id: group.id,
      heading: `4.${group.label} ${name}`,
      observed: text(rowData.findings_text),
      remediation: text(rowData.remediation),
      annotation: group.annotation?.canvas_data || null,
      annotationCaption: `Figure ${group.label}: Annotated view of ${name}`,
      figures,
    };
  }).filter(g => g.figures.length || g.annotation || g.observed || g.remediation);

  const remediationFor = (finding) => RECOMMENDED_ACTION[finding.defect_type] || "Inspect and repair as required.";

  const findingRows = allFindings
    .slice()
    .sort((a, b) => String(figureNo[a.photo_id] || "z").localeCompare(String(figureNo[b.photo_id] || "z"), undefined, { numeric: true }))
    .map(f => [
      figureNo[f.photo_id] || "-",
      defectLabel(f.defect_type),
      severityLabel(f.severity),
      findingSource(f),
      remediationFor(f),
    ]);

  const counts = { total: allFindings.length, ai: allFindings.filter(f => f.source === "ai").length };
  counts.manual = counts.total - counts.ai;
  const bySeverity = ["critical", "high", "medium", "low"]
    .map(s => [s, allFindings.filter(f => f.severity === s).length])
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${severityLabel(s)}`);
  const photoCount = (photos || []).length;
  const countLine = counts.total
    ? `${counts.total} finding(s) were recorded across ${photoCount} photograph(s): ${counts.ai} detected by the AI model and ${counts.manual} logged manually. By severity: ${bySeverity.join(", ")}.`
    : `No defects were recorded across ${photoCount} photograph(s).`;

  const preparedBy = text(creator?.name) || "Inspector";
  const reportDate = fmtDate(report?.published_at || report?.created_at);
  const reportNo = text(insp.reference) || "Inspection Report";

  const reviewed = !!insp.severity;
  const review = reviewed
    ? [
        ["Overall severity", severityLabel(insp.severity)],
        ["Reviewed by", text(insp.assessor_name) || "Facility manager"],
        ["Review date", fmtDate(insp.assessed_at)],
        ["Reviewer notes", text(insp.severity_note) || "None"],
      ]
    : null;

  return {
    logoUrl,
    reportNo,
    title: text(header?.title) || text(report?.title) || text(insp.title) || "Inspection Report",
    titleRows: [
      ["Inspection No.", reportNo],
      ["Complaint No.", text(insp.complaint_reference) || "Not linked to a complaint"],
      ["Building", building.name ? `${building.name}${building.code ? ` (${building.code})` : ""}` : "-"],
      ["Report date", reportDate || "-"],
      ["Prepared by", preparedBy],
    ],
    details: [
      ["Inspection title", text(insp.title) || "-"],
      ["Building", text(building.name) || "-"],
      ["Building code", text(building.code) || "-"],
      ["Location", text(building.location) || "-"],
      ["Floor", text(insp.floor_level) || "-"],
      ["Area inspected", area || "-"],
      ["Inspection date", fmtDate(insp.inspection_date) || "-"],
      ["Weather", capitalise(insp.weather_condition) || "-"],
      ["Inspection status", capitalise(insp.status) || "-"],
      ["Site remarks", text(insp.description) || "None"],
    ],
    summary: [text(header?.summary), countLine].filter(Boolean),
    recommendations: text(header?.recommendations),
    findingRows,
    groups: groupBlocks,
    review,
    reviewPending: "This inspection has not been reviewed by a facility manager yet. The overall severity will be set during the Severity Review.",
    signoff: [
      { role: "Prepared by", name: preparedBy, date: reportDate },
      { role: "Reviewed by (Facility Manager)", name: reviewed ? text(insp.assessor_name) : "", date: reviewed ? fmtDate(insp.assessed_at) : "" },
    ],
  };
}

async function loadImage(src) {
  const blob = await fetch(src, { mode: "cors" }).then(r => {
    if (!r.ok) throw new Error(`Image ${r.status}`);
    return r.blob();
  });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function renderToJpeg(img, boxes = [], maxSide = 1400) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  ctx.lineWidth = Math.max(2, Math.round(Math.max(w, h) / 300));
  ctx.strokeStyle = "#dc2626";
  for (const f of boxes) {
    const b = f.bbox;
    const kx = w / (b.width || img.naturalWidth);
    const ky = h / (b.height || img.naturalHeight);
    ctx.strokeRect(b.xmin * kx, b.ymin * ky, (b.xmax - b.xmin) * kx, (b.ymax - b.ymin) * ky);
  }
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), width: w, height: h };
}

async function prepare(src, boxes) {
  try {
    return renderToJpeg(await loadImage(src), boxes);
  } catch {
    return null;
  }
}

export async function prepareImages(model) {
  const logo = await prepare(model.logoUrl, []);
  const groups = await Promise.all(model.groups.map(async g => ({
    ...g,
    annotationImage: g.annotation ? await prepare(g.annotation, []) : null,
    figures: await Promise.all(g.figures.map(async f => ({ ...f, image: await prepare(f.url, f.boxes) }))),
  })));
  return { ...model, logo, groups };
}

export function dataUrlBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function reportFileName(model, ext) {
  const safe = `${model.reportNo} ${model.title}`.replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "_");
  return `${safe || "VIDA_Report"}.${ext}`;
}
