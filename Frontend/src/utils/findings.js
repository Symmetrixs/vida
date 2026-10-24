export const DEFECT_TYPES = ["crack", "faded_paint", "spalling", "water_stain", "rust", "mold", "efflorescence"];
export const SEVERITIES = ["low", "medium", "high", "critical"];

export const DEFECT_COLORS = {
  crack:         "#ef4444",
  faded_paint:   "#f59e0b",
  spalling:      "#8b5cf6",
  water_stain:   "#3b82f6",
  rust:          "#b45309",
  mold:          "#16a34a",
  efflorescence: "#64748b",
};

export const RECOMMENDED_ACTION = {
  crack:         "Seal the crack with suitable filler or epoxy injection and monitor for further movement.",
  spalling:      "Remove loose concrete, treat exposed reinforcement and patch with repair mortar.",
  water_stain:   "Trace and fix the water source, then dry and repaint the affected surface.",
  mold:          "Clean with fungicidal solution, improve ventilation and apply anti-mould paint.",
  rust:          "Remove rust by wire brushing, apply rust converter and repaint with protective coating.",
  faded_paint:   "Prepare the surface and repaint with weather-resistant paint.",
  efflorescence: "Brush off salt deposits, fix moisture ingress and apply a breathable sealer.",
};

export const capitalise = (text) =>
  String(text ?? "").replace(/_/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, c => c.toUpperCase());

export const defectLabel = (type) => capitalise(type || "Unknown");

export const severityLabel = (severity) => capitalise(severity || "Not set");

export const confidencePercent = (finding) => Math.round((finding?.confidence || 0) * 100);

export const isAiFinding = (finding) => finding?.source === "ai" || (finding?.source == null && finding?.confidence != null);

export function findingSource(finding) {
  const base = isAiFinding(finding)
    ? `AI, ${confidencePercent(finding)}% confidence`
    : `Logged manually by ${finding?.created_by_name || "an inspector"}`;
  return finding?.edited_by_name ? `${base}, edited by ${finding.edited_by_name}` : base;
}

export function findingsByPhoto(findings) {
  const map = {};
  for (const f of findings || []) {
    if (!f.photo_id) continue;
    (map[f.photo_id] = map[f.photo_id] || []).push(f);
  }
  return map;
}

export const boxesFor = (findings) => (findings || []).filter(f => f.bbox && isAiFinding(f));
