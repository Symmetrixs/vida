import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, PageNumber,
  Paragraph, Table, TableCell, TableRow, TabStopType, TextRun, VerticalAlign, WidthType,
} from "docx";
import { FINDING_COLUMNS, SECTION, buildReportModel, dataUrlBytes, prepareImages, reportFileName } from "./reportModel.js";

const FONT = "Arial";
const INK = "111827";
const MUTED = "4B5563";
const RULE = "BEBEBE";
const MM = 56.7;
const PAGE_W = 11906;
const MARGIN = Math.round(20 * MM);
const CONTENT_W = PAGE_W - 2 * MARGIN;
const LABEL_W = Math.round(48 * MM);
const FINDING_WIDTHS = [16, 26, 20, 42].map(mm => Math.round(mm * MM));
FINDING_WIDTHS.push(CONTENT_W - FINDING_WIDTHS.reduce((a, b) => a + b, 0));
const PX_PER_MM = 96 / 25.4;

const run = (text, opts = {}) => new TextRun({ text, font: FONT, size: opts.size || 20, bold: opts.bold, color: opts.color || INK });
const line = (border = RULE, size = 4) => ({ style: BorderStyle.SINGLE, size, color: border });
const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
const GRID = { top: line(), bottom: line(), left: line(), right: line(), insideHorizontal: line(), insideVertical: line() };

const para = (text, opts = {}) => new Paragraph({
  keepNext: opts.keepNext,
  alignment: opts.align,
  spacing: { after: opts.after ?? 80, before: opts.before ?? 0 },
  children: String(text ?? "").split("\n").flatMap((t, i) => (i ? [new TextRun({ break: 1 }), run(t, opts)] : [run(t, opts)])),
});

const heading = (text) => new Paragraph({
  keepNext: true,
  keepLines: true,
  spacing: { before: 280, after: 140 },
  border: { bottom: line(MUTED, 6) },
  children: [run(text, { bold: true, size: 24 })],
});

const subheading = (text) => new Paragraph({
  keepNext: true,
  spacing: { before: 120, after: 60 },
  children: [run(text, { bold: true })],
});

const cell = (children, width, opts = {}) => new TableCell({
  width: { size: width, type: WidthType.DXA },
  margins: { top: 60, bottom: 60, left: 90, right: 90 },
  verticalAlign: opts.valign || VerticalAlign.TOP,
  children,
});

function kvTable(rows, bordered = true) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [LABEL_W, CONTENT_W - LABEL_W],
    borders: bordered ? GRID : NO_BORDERS,
    rows: rows.map(([label, value]) => new TableRow({
      cantSplit: true,
      children: [
        cell([para(label, { bold: true, after: 0 })], LABEL_W),
        cell([para(value, { after: 0 })], CONTENT_W - LABEL_W),
      ],
    })),
  });
}

function findingsTable(rows) {
  const headerBorders = { top: line(MUTED, 6), bottom: line(MUTED, 6), left: none, right: none };
  const rowBorders = { top: none, bottom: line(), left: none, right: none };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: FINDING_WIDTHS,
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: FINDING_COLUMNS.map((c, i) => new TableCell({
          width: { size: FINDING_WIDTHS[i], type: WidthType.DXA },
          borders: headerBorders,
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: [para(c, { bold: true, size: 18, after: 0 })],
        })),
      }),
      ...rows.map(row => new TableRow({
        cantSplit: true,
        children: row.map((c, i) => new TableCell({
          width: { size: FINDING_WIDTHS[i], type: WidthType.DXA },
          borders: rowBorders,
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: [para(c, { size: 18, after: 0 })],
        })),
      })),
    ],
  });
}

function imageRun(image, maxWmm, maxHmm) {
  let w = maxWmm;
  let h = (w * image.height) / image.width;
  if (h > maxHmm) { h = maxHmm; w = (h * image.width) / image.height; }
  return new ImageRun({
    type: "jpg",
    data: dataUrlBytes(image.dataUrl),
    transformation: { width: Math.round(w * PX_PER_MM), height: Math.round(h * PX_PER_MM) },
  });
}

function figureParagraphs(fig, maxWmm, maxHmm) {
  const picture = fig.image
    ? new Paragraph({ keepNext: true, alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [imageRun(fig.image, maxWmm, maxHmm)] })
    : para("Image could not be loaded", { keepNext: true, align: AlignmentType.CENTER, color: MUTED });
  return [picture, para(fig.caption, { size: 18, align: AlignmentType.CENTER, after: 120 })];
}

function figureTable(figures) {
  const half = Math.floor(CONTENT_W / 2);
  const rows = [];
  for (let i = 0; i < figures.length; i += 2) {
    const pair = figures.slice(i, i + 2);
    rows.push(new TableRow({
      cantSplit: true,
      children: [0, 1].map(k => cell(pair[k] ? figureParagraphs(pair[k], 81, 62) : [para("")], half)),
    }));
  }
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [half, CONTENT_W - half], borders: NO_BORDERS, rows });
}

function signoffTable(signoff) {
  const half = Math.floor(CONTENT_W / 2);
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [half, CONTENT_W - half],
    borders: NO_BORDERS,
    rows: [new TableRow({
      cantSplit: true,
      children: signoff.map(s => cell([
        para(s.role, { bold: true, after: 600 }),
        new Paragraph({ border: { bottom: line(INK, 6) }, spacing: { after: 80 }, children: [run("")] }),
        para(`Name: ${s.name || ""}`, { after: 40 }),
        para(`Date: ${s.date || ""}`),
      ], half)),
    })],
  });
}

export function buildDocx(model) {
  const body = [];
  body.push(para(model.title, { bold: true, size: 36, after: 60 }));
  body.push(para("Building Defect Inspection Report", { color: MUTED, after: 120 }));
  body.push(kvTable(model.titleRows, false));
  body.push(new Paragraph({ border: { bottom: line(MUTED, 6) }, spacing: { after: 120 }, children: [run("")] }));

  body.push(heading(SECTION.details));
  body.push(kvTable(model.details));

  body.push(heading(SECTION.summary));
  model.summary.forEach(p => body.push(para(p, { after: 120 })));
  if (model.recommendations) {
    body.push(subheading("General recommendations"));
    body.push(para(model.recommendations, { after: 120 }));
  }

  body.push(heading(SECTION.findings));
  body.push(model.findingRows.length ? findingsTable(model.findingRows) : para("No findings were recorded for this inspection."));

  body.push(heading(SECTION.photos));
  if (!model.groups.length) body.push(para("No photographs were attached to this inspection."));
  for (const g of model.groups) {
    body.push(subheading(g.heading));
    if (g.figures.length) body.push(figureTable(g.figures));
    if (g.annotation) body.push(...figureParagraphs({ image: g.annotationImage, caption: g.annotationCaption }, 170, 110));
    if (g.observed) { body.push(subheading("Observed defects")); body.push(para(g.observed, { after: 120 })); }
    if (g.remediation) { body.push(subheading("Recommended works")); body.push(para(g.remediation, { after: 120 })); }
  }

  body.push(heading(SECTION.review));
  body.push(model.review ? kvTable(model.review) : para(model.reviewPending));

  body.push(heading(SECTION.signoff));
  body.push(signoffTable(model.signoff));

  const headerChildren = [];
  if (model.logo) {
    const h = 8;
    headerChildren.push(new ImageRun({
      type: "jpg",
      data: dataUrlBytes(model.logo.dataUrl),
      transformation: { width: Math.round(((h * model.logo.width) / model.logo.height) * PX_PER_MM), height: Math.round(h * PX_PER_MM) },
    }));
    headerChildren.push(run("  "));
  }
  headerChildren.push(run("VIDA Inspection Report", { size: 18, color: MUTED }));
  headerChildren.push(new TextRun({ text: `\t${model.reportNo}`, font: FONT, size: 18, color: MUTED }));

  return new Document({
    creator: "VIDA",
    title: model.title,
    styles: { default: { document: { run: { font: FONT, size: 20, color: INK } } } },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: 16838 },
          margin: { top: Math.round(27 * MM), bottom: Math.round(20 * MM), left: MARGIN, right: MARGIN, header: Math.round(9 * MM), footer: Math.round(8 * MM) },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
            border: { bottom: line() },
            children: headerChildren,
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ font: FONT, size: 18, color: MUTED, children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES] })],
          })],
        }),
      },
      children: body,
    }],
  });
}

export async function exportReportDocx(payload) {
  const model = await prepareImages(buildReportModel(payload));
  const blob = await Packer.toBlob(buildDocx(model));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = reportFileName(model, "docx");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
