import { jsPDF } from "jspdf";
import { FINDING_COLUMNS, SECTION, buildReportModel, prepareImages, reportFileName } from "./reportModel.js";

const PAGE_W = 210;
const LEFT = 20;
const W = PAGE_W - 2 * LEFT;
const TOP = 27;
const BOTTOM = 279;
const LH = 5;
const SMALL_LH = 4.2;
const INK = [17, 24, 39];
const MUTED = [75, 85, 99];
const RULE = [190, 190, 190];
const LABEL_W = 48;
const FINDING_WIDTHS = [16, 26, 20, 42, W - 104];
const FIG_GAP = 8;
const FIG_W = (W - FIG_GAP) / 2;
const FIG_MAX_H = 62;
const HEADING_H = 12;

export function renderPdf(model) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = TOP;

  const font = (size = 10, style = "normal", color = INK) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const split = (str, width, size = 10, style = "normal") => {
    font(size, style);
    return doc.splitTextToSize(String(str ?? ""), width);
  };
  const newPage = () => { doc.addPage(); y = TOP; };
  const ensure = (h) => { if (y + h > BOTTOM) newPage(); };
  const rule = (yy, color = RULE, width = 0.2) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(width);
    doc.line(LEFT, yy, LEFT + W, yy);
  };

  const heading = (label, minNext = 0) => {
    ensure(HEADING_H + minNext);
    font(12, "bold");
    doc.text(label, LEFT, y + 6);
    rule(y + 8, MUTED, 0.3);
    y += HEADING_H;
  };

  const subheading = (label, minNext = 0) => {
    ensure(7 + minNext);
    font(10, "bold");
    doc.text(label, LEFT, y + 4.5);
    y += 7;
  };

  const paragraph = (str, gap = 3) => {
    for (const line of split(str, W)) {
      ensure(LH);
      font(10);
      doc.text(line, LEFT, y + LH - 1.3);
      y += LH;
    }
    y += gap;
  };
  const paragraphMin = (str) => Math.min(split(str, W).length, 2) * LH;

  const drawKvRow = (labLines, valLines, bordered) => {
    const h = Math.max(labLines.length, valLines.length) * LH + 3;
    if (bordered) {
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.2);
      doc.rect(LEFT, y, W, h);
      doc.line(LEFT + LABEL_W, y, LEFT + LABEL_W, y + h);
    }
    font(10, "bold");
    labLines.forEach((l, i) => doc.text(l, LEFT + 2, y + 1.5 + LH * (i + 1) - 1.3));
    font(10);
    valLines.forEach((l, i) => doc.text(l, LEFT + LABEL_W + 2, y + 1.5 + LH * (i + 1) - 1.3));
    y += h;
  };

  const kvTable = (rows, bordered = true) => {
    for (const [label, value] of rows) {
      const lab = split(label, LABEL_W - 4, 10, "bold");
      let val = split(value, W - LABEL_W - 4);
      const h = Math.max(lab.length, val.length) * LH + 3;
      if (h <= BOTTOM - TOP) {
        ensure(h);
        drawKvRow(lab, val, bordered);
        continue;
      }
      let first = true;
      while (val.length) {
        const fit = Math.floor((BOTTOM - y - 3) / LH);
        if (fit < 2) { newPage(); continue; }
        drawKvRow(first ? lab : [], val.slice(0, fit), bordered);
        val = val.slice(fit);
        first = false;
      }
    }
    y += 4;
  };
  const kvMin = (rows) => {
    const [label, value] = rows[0];
    return Math.max(split(label, LABEL_W - 4, 10, "bold").length, Math.min(split(value, W - LABEL_W - 4).length, 3)) * LH + 3;
  };

  const tableHeader = () => {
    const cells = FINDING_COLUMNS.map((c, i) => split(c, FINDING_WIDTHS[i] - 3, 9, "bold"));
    const h = Math.max(...cells.map(c => c.length)) * SMALL_LH + 3;
    rule(y, MUTED, 0.3);
    let x = LEFT;
    font(9, "bold");
    cells.forEach((c, i) => { c.forEach((l, j) => doc.text(l, x + 1.5, y + 1.5 + SMALL_LH * (j + 1) - 1)); x += FINDING_WIDTHS[i]; });
    y += h;
    rule(y, MUTED, 0.3);
    return h;
  };
  const tableRowCells = (row) => row.map((c, i) => split(c, FINDING_WIDTHS[i] - 3, 9));
  const tableRowH = (cells) => Math.max(...cells.map(c => c.length)) * SMALL_LH + 3;
  const findingsTable = (rows) => {
    tableHeader();
    for (const row of rows) {
      const cells = tableRowCells(row);
      const h = tableRowH(cells);
      if (y + h > BOTTOM) { newPage(); tableHeader(); }
      let x = LEFT;
      font(9);
      cells.forEach((c, i) => { c.forEach((l, j) => doc.text(l, x + 1.5, y + 1.5 + SMALL_LH * (j + 1) - 1)); x += FINDING_WIDTHS[i]; });
      y += h;
      rule(y);
    }
    y += 5;
  };
  const tableMin = (rows) => {
    const headerH = Math.max(...FINDING_COLUMNS.map((c, i) => split(c, FINDING_WIDTHS[i] - 3, 9, "bold").length)) * SMALL_LH + 3;
    return headerH + (rows.length ? tableRowH(tableRowCells(rows[0])) : 0);
  };

  const fitImage = (image, maxW, maxH) => {
    if (!image) return { w: maxW, h: 40 };
    let w = maxW;
    let h = (w * image.height) / image.width;
    if (h > maxH) { h = maxH; w = (h * image.width) / image.height; }
    return { w, h };
  };
  const figureLayout = (fig, cellW, maxH) => {
    const size = fitImage(fig.image, cellW, maxH);
    const caption = split(fig.caption, cellW, 9);
    return { fig, size, caption, h: size.h + 2 + caption.length * SMALL_LH };
  };
  const drawFigure = (layout, x, cellW, imageAreaH = layout.size.h) => {
    const { fig, size, caption } = layout;
    const ix = x + (cellW - size.w) / 2;
    if (fig.image) {
      doc.addImage(fig.image.dataUrl, "JPEG", ix, y, size.w, size.h, undefined, "FAST");
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.2);
      doc.rect(ix, y, size.w, size.h);
    } else {
      doc.setDrawColor(...RULE);
      doc.rect(ix, y, size.w, size.h);
      font(9, "normal", MUTED);
      doc.text("Image could not be loaded", ix + size.w / 2, y + size.h / 2, { align: "center" });
    }
    font(9);
    caption.forEach((l, i) => doc.text(l, x + cellW / 2, y + imageAreaH + 2 + SMALL_LH * (i + 1) - 1, { align: "center" }));
  };
  const figureRows = (figures) => {
    const rows = [];
    for (let i = 0; i < figures.length; i += 2) rows.push(figures.slice(i, i + 2).map(f => figureLayout(f, FIG_W, FIG_MAX_H)));
    return rows;
  };
  const rowHeight = (row) => Math.max(...row.map(c => c.size.h)) + 2 + Math.max(...row.map(c => c.caption.length)) * SMALL_LH + 6;
  const drawFigureRow = (row) => {
    const h = rowHeight(row);
    const imageAreaH = Math.max(...row.map(c => c.size.h));
    ensure(h);
    row.forEach((cell, i) => drawFigure(cell, LEFT + i * (FIG_W + FIG_GAP), FIG_W, imageAreaH));
    y += h;
  };

  font(18, "bold");
  const titleLines = split(model.title, W, 18, "bold");
  titleLines.forEach((l, i) => doc.text(l, LEFT, y + 7 + i * 8));
  y += titleLines.length * 8 + 4;
  font(10, "normal", MUTED);
  doc.text("Building Defect Inspection Report", LEFT, y);
  y += 5;
  kvTable(model.titleRows, false);
  rule(y - 2, MUTED, 0.3);
  y += 4;

  heading(SECTION.details, kvMin(model.details));
  kvTable(model.details);

  heading(SECTION.summary, paragraphMin(model.summary[0] || ""));
  model.summary.forEach(p => paragraph(p));
  if (model.recommendations) {
    subheading("General recommendations", paragraphMin(model.recommendations));
    paragraph(model.recommendations);
  }

  heading(SECTION.findings, model.findingRows.length ? tableMin(model.findingRows) : LH);
  if (model.findingRows.length) findingsTable(model.findingRows);
  else paragraph("No findings were recorded for this inspection.");

  const groupLayouts = model.groups.map(g => ({ group: g, rows: figureRows(g.figures) }));
  const firstGroupMin = (gl) => {
    if (gl.rows.length) return rowHeight(gl.rows[0]);
    if (gl.group.annotationImage) return 60;
    return 2 * LH + 7;
  };
  heading(SECTION.photos, groupLayouts.length ? HEADING_H + firstGroupMin(groupLayouts[0]) : LH);
  if (!groupLayouts.length) paragraph("No photographs were attached to this inspection.");
  for (const gl of groupLayouts) {
    const g = gl.group;
    ensure(9 + firstGroupMin(gl));
    font(11, "bold");
    doc.text(g.heading, LEFT, y + 5);
    y += 9;
    gl.rows.forEach(drawFigureRow);
    if (g.annotationImage || g.annotation) {
      const layout = figureLayout({ image: g.annotationImage, caption: g.annotationCaption }, W, 110);
      ensure(layout.h + 6);
      drawFigure(layout, LEFT, W);
      y += layout.h + 6;
    }
    if (g.observed) { subheading("Observed defects", paragraphMin(g.observed)); paragraph(g.observed); }
    if (g.remediation) { subheading("Recommended works", paragraphMin(g.remediation)); paragraph(g.remediation); }
    y += 2;
  }

  if (model.review) {
    heading(SECTION.review, kvMin(model.review));
    kvTable(model.review);
  } else {
    heading(SECTION.review, paragraphMin(model.reviewPending));
    paragraph(model.reviewPending);
  }

  const signH = 44;
  heading(SECTION.signoff, signH);
  const colW = (W - 16) / 2;
  model.signoff.forEach((s, i) => {
    const x = LEFT + i * (colW + 16);
    font(10, "bold");
    doc.text(s.role, x, y + 5);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.3);
    doc.line(x, y + 26, x + colW, y + 26);
    font(10);
    doc.text(`Name: ${s.name || ""}`, x, y + 32);
    doc.text(`Date: ${s.date || ""}`, x, y + 38);
  });
  y += signH;

  const total = doc.getNumberOfPages();
  const logoH = 8;
  const logoW = model.logo ? (logoH * model.logo.width) / model.logo.height : 0;
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    if (model.logo) doc.addImage(model.logo.dataUrl, "JPEG", LEFT, 9, logoW, logoH, undefined, "FAST");
    font(9, "normal", MUTED);
    doc.text("VIDA Inspection Report", LEFT + logoW + (logoW ? 3 : 0), 14.5);
    doc.text(model.reportNo, LEFT + W, 14.5, { align: "right" });
    rule(19);
    doc.text(`Page ${i} of ${total}`, PAGE_W / 2, 289, { align: "center" });
  }
  return doc;
}

export async function exportReportPdf(payload) {
  const model = await prepareImages(buildReportModel(payload));
  renderPdf(model).save(reportFileName(model, "pdf"));
}
