import { jsPDF } from "jspdf";

const DEFECT_COLORS = {
  crack:         [239, 68,  68 ],
  faded_paint:   [245, 158, 11 ],
  spalling:      [139, 92,  246],
  water_stain:   [59,  130, 246],
  rust:          [180, 83,  9  ],
  mold:          [22,  163, 74 ],
  efflorescence: [100, 116, 139],
};

const SEVERITY_LABEL = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

const STAT_COLORS = [
  [99,  102, 241],
  [239, 68,  68 ],
  [245, 158, 11 ],
  [22,  163, 74 ],
];

const toBase64 = (url) =>
  fetch(url, { mode: "cors" })
    .then(r => r.blob())
    .then(b => new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload  = () => res(reader.result);
      reader.onerror = rej;
      reader.readAsDataURL(b);
    }))
    .catch(() => null);

const LINE_H  = 5.2;
const MARGIN  = 14;
const PAGE_W  = 210;
const PAGE_H  = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;

const addPageHeader = (doc, pageNum) => {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, PAGE_W, 13, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text("VIDA — Visual Infrastructure Defect Analyzer", MARGIN, 8.5);
  doc.text("Page " + pageNum, PAGE_W - MARGIN, 8.5, { align: "right" });
};

const addSectionTitle = (doc, text, y) => {
  doc.setFillColor(30, 58, 138);
  doc.roundedRect(MARGIN, y, CONTENT_W, 8.5, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(text, MARGIN + 4, y + 5.8);
  return y + 13;
};

const addSubLabel = (doc, text, y) => {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(text, MARGIN, y);
  return y + 5;
};

const addBodyText = (doc, text, y, maxW) => {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  const lines = doc.splitTextToSize(text, maxW || CONTENT_W);
  doc.text(lines, MARGIN, y);
  return y + lines.length * LINE_H + 3;
};

export async function exportReportPdf({ report, inspection, findings, photos, groups, creator, header, rows }) {
  const doc    = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let   y      = 0;
  let   pageNum = 1;

  const newPage = () => {
    doc.addPage();
    pageNum++;
    addPageHeader(doc, pageNum);
    y = 20;
  };

  const ensureSpace = (needed) => {
    if (y + needed > PAGE_H - 18) newPage();
  };

  addPageHeader(doc, pageNum);

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 13, PAGE_W, 50, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(header.title || report.title || "Inspection Report", CONTENT_W - 10);
  doc.text(titleLines, MARGIN, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184);
  const subtitle = (inspection?.buildings?.name || "") + "  ·  " + (inspection?.inspection_date || "") + "  ·  Prepared by " + (creator?.name || "");
  doc.text(doc.splitTextToSize(subtitle, CONTENT_W - 32), MARGIN, 42);
  doc.text("Generated: " + new Date().toLocaleDateString("en-MY", { year: "numeric", month: "long", day: "numeric" }), MARGIN, 49);

  const isPublished = report.status === "published";
  doc.setFillColor(isPublished ? 22 : 100, isPublished ? 163 : 116, isPublished ? 74 : 139);
  doc.roundedRect(PAGE_W - 38, 17, 24, 7, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text((report.status || "draft").toUpperCase(), PAGE_W - 26, 22, { align: "center" });

  y = 70;

  y = addSectionTitle(doc, "1.  INSPECTION DETAILS", y);

  const col1x = MARGIN;
  const col2x = MARGIN + CONTENT_W / 2 + 3;
  const colLW = 36;
  const pairs = [
    ["Building",        inspection?.buildings?.name],
    ["Building Code",   inspection?.buildings?.code],
    ["Inspection Date", inspection?.inspection_date],
    ["Weather",         inspection?.weather_condition],
    ["Floor Level",     inspection?.floor_level],
    ["Area Inspected",  inspection?.area_inspected],
    ["Prepared By",     creator?.name],
    ["Report Date",     new Date(report.created_at).toLocaleDateString("en-MY")],
  ];
  for (let i = 0; i < pairs.length; i += 2) {
    ensureSpace(7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(pairs[i][0],     col1x,           y);
    doc.text(pairs[i + 1][0], col2x,           y);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.text(String(pairs[i][1]     || "—"), col1x + colLW, y);
    doc.text(String(pairs[i + 1][1] || "—"), col2x + colLW, y);
    y += 6.5;
  }
  if (inspection?.description) {
    ensureSpace(12);
    y += 2;
    doc.setDrawColor(226, 232, 240);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 4;
    y = addSubLabel(doc, "Site Remarks", y);
    y = addBodyText(doc, inspection.description, y);
  }
  y += 4;

  if (header.summary) {
    ensureSpace(20);
    y = addSectionTitle(doc, "2.  EXECUTIVE SUMMARY", y);
    y = addBodyText(doc, header.summary, y);
    y += 4;
  }

  if (findings.length > 0) {
    ensureSpace(28);
    y = addSectionTitle(doc, "3.  SUMMARY STATISTICS", y);
    const statValues = [
      findings.length,
      findings.filter(function(f) { return f.severity === "high" || f.severity === "critical"; }).length,
      findings.filter(function(f) { return f.severity === "medium"; }).length,
      findings.filter(function(f) { return f.severity === "low"; }).length,
    ];
    const statLabels = ["Total Findings", "High / Critical", "Medium", "Low"];
    const bw = (CONTENT_W - 9) / 4;
    for (let si = 0; si < 4; si++) {
      const bx = MARGIN + si * (bw + 3);
      const sc = STAT_COLORS[si];
      doc.setFillColor(sc[0], sc[1], sc[2]);
      doc.roundedRect(bx, y, bw, 18, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text(String(statValues[si]), bx + bw / 2, y + 10, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(255, 255, 255);
      doc.text(statLabels[si], bx + bw / 2, y + 15.5, { align: "center" });
    }
    y += 24;

    const breakdown = findings.reduce(function(acc, f) { acc[f.defect_type] = (acc[f.defect_type] || 0) + 1; return acc; }, {});
    ensureSpace(14);
    y = addSubLabel(doc, "Defect Breakdown", y);
    let bx2 = MARGIN;
    Object.entries(breakdown).forEach(function(entry) {
      const type  = entry[0];
      const count = entry[1];
      const dc    = DEFECT_COLORS[type] || [99, 102, 241];
      const label = type.replace(/_/g, " ") + " x" + count;
      const lw    = doc.getTextWidth(label) + 8;
      if (bx2 + lw > MARGIN + CONTENT_W) { bx2 = MARGIN; y += 8; }
      doc.setFillColor(dc[0], dc[1], dc[2]);
      doc.roundedRect(bx2, y, lw, 6, 1.5, 1.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(label, bx2 + 4, y + 4.2);
      bx2 += lw + 3;
    });
    y += 12;
  }

  ensureSpace(14);
  y = addSectionTitle(doc, "4.  FINDINGS & REMEDIATION", y);

  for (let gi = 0; gi < groups.length; gi++) {
    const group         = groups[gi];
    const rowData       = (rows && rows[group.id]) || {};
    const displayName   = rowData.group_name || ("Group " + group.label);
    const groupPhotos   = group.photoIds.map(function(id) { return photos.find(function(p) { return p.id === id; }); }).filter(Boolean);
    const groupFindings = findings.filter(function(f) { return group.photoIds.includes(f.photo_id); });
    const hasAnnot      = !!(group.annotation && group.annotation.canvas_data);

    const photoIndexMap = {};
    groupPhotos.forEach(function(photo, pIdx) { photoIndexMap[photo.id] = pIdx + 1; });

    const numberedFindings = groupFindings.map(function(f, fi) {
      const pNum = f.photo_id && photoIndexMap[f.photo_id]
        ? group.label + "." + photoIndexMap[f.photo_id]
        : group.label + "." + (fi + 1);
      return Object.assign({}, f, { photoNum: pNum });
    });

    newPage();

    doc.setFillColor(241, 245, 249);
    doc.roundedRect(MARGIN, y, CONTENT_W, 9, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    const groupHeader = displayName + "  ·  " + groupPhotos.length + " photo" + (groupPhotos.length !== 1 ? "s" : "") +
      (groupFindings.length ? "  ·  " + groupFindings.length + " finding" + (groupFindings.length !== 1 ? "s" : "") : "");
    doc.text(groupHeader, MARGIN + 4, y + 6);
    y += 13;

    if (hasAnnot) {
      ensureSpace(70);
      const imgW = CONTENT_W;
      const imgH = imgW * 0.55;
      try {
        doc.addImage(group.annotation.canvas_data, "PNG", MARGIN, y, imgW, imgH);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text("Annotated canvas — " + displayName, MARGIN, y + imgH + 4);
        y += imgH + 9;
      } catch (e) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text("[Annotated image could not be rendered]", MARGIN, y + 6);
        y += 12;
      }
    } else {
      const imgW  = (CONTENT_W - 6) / 4;
      const imgH  = imgW * 0.75;
      const batch = groupPhotos.slice(0, 4);
      ensureSpace(imgH + 10);
      const imgDataArr = await Promise.all(batch.map(function(p) { return toBase64(p.url); }));
      let maxRowH = 0;
      for (let pi = 0; pi < batch.length; pi++) {
        const ix = MARGIN + pi * (imgW + 2);
        if (imgDataArr[pi]) {
          try {
            doc.addImage(imgDataArr[pi], "JPEG", ix, y, imgW, imgH);
          } catch (e) {}
        } else {
          doc.setFillColor(241, 245, 249);
          doc.rect(ix, y, imgW, imgH, "F");
        }
        doc.setFillColor(0, 0, 0);
        doc.roundedRect(ix + 1, y + 1, 12, 5, 1, 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(255, 255, 255);
        doc.text(group.label + "." + (pi + 1), ix + 2, y + 4.5);
        maxRowH = imgH;
      }
      y += maxRowH + 5;
    }

    if (numberedFindings.length > 0) {
      ensureSpace(8 + numberedFindings.length * 7);
      y = addSubLabel(doc, "AI Detections", y);
      for (let fi = 0; fi < numberedFindings.length; fi++) {
        const f   = numberedFindings[fi];
        const dc  = DEFECT_COLORS[f.defect_type] || [99, 102, 241];
        ensureSpace(7);
        doc.setFillColor(dc[0], dc[1], dc[2]);
        doc.roundedRect(MARGIN, y, CONTENT_W, 6, 1, 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        const confStr = f.confidence ? "  ·  " + Math.round(f.confidence * 100) + "%" : "";
        doc.text(
          "[" + f.photoNum + "]  " + (f.defect_type || "").replace(/_/g, " ") + "  ·  " + (SEVERITY_LABEL[f.severity] || f.severity) + confStr,
          MARGIN + 3, y + 4.2
        );
        y += 7.5;
      }
      y += 3;
    }

    doc.setDrawColor(226, 232, 240);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 5;

    if (rowData.findings_text) {
      ensureSpace(12);
      y = addSubLabel(doc, "Observed Defects & Findings", y);
      y = addBodyText(doc, rowData.findings_text, y);
    }
    if (rowData.remediation) {
      ensureSpace(12);
      y = addSubLabel(doc, "Recommended Remediation Works", y);
      y = addBodyText(doc, rowData.remediation, y);
    }
    if (!rowData.findings_text && !rowData.remediation) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("No findings text entered for this group.", MARGIN, y + 5);
      y += 11;
    }
    y += 6;
  }

  if (header.recommendations) {
    ensureSpace(20);
    y = addSectionTitle(doc, "5.  GENERAL RECOMMENDATIONS", y);
    y = addBodyText(doc, header.recommendations, y);
    y += 4;
  }

  ensureSpace(36);
  y = addSectionTitle(doc, "6.  DECLARATION", y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text("This report was prepared by:", MARGIN, y);
  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(creator?.name || "—", MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    (creator?.email || "") + "  ·  Generated by VIDA System on " +
    new Date().toLocaleDateString("en-MY", { year: "numeric", month: "long", day: "numeric" }),
    MARGIN, y
  );

  const safeTitle = (header.title || report.title || "report").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
  doc.save("VIDA_Report_" + safeTitle + "_" + new Date().toISOString().slice(0, 10) + ".pdf");
}