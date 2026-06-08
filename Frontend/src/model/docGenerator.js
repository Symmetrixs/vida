const SEVERITY_LABEL = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

const DEFECT_HEX = {
  crack:         "EF4444",
  faded_paint:   "F59E0B",
  spalling:      "8B5CF6",
  water_stain:   "3B82F6",
  rust:          "B45309",
  mold:          "16A34A",
  efflorescence: "64748B",
};

const toBase64Bytes = (url) =>
  fetch(url, { mode: "cors" })
    .then(r => r.blob())
    .then(b => new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload  = () => {
        const b64 = reader.result.split(",")[1];
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        res({ b64, arr });
      };
      reader.onerror = rej;
      reader.readAsDataURL(b);
    }))
    .catch(() => null);

const emu = (mm) => Math.round(mm * 36000);

const xmlEscape = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const wpara = (text, opts) => {
  const o       = opts || {};
  const sz      = o.sz   || 20;
  const color   = o.color || "1E293B";
  const bold    = o.bold  ? "<w:b/>" : "";
  const italic  = o.italic ? "<w:i/>" : "";
  const before  = o.before !== undefined ? o.before : 60;
  const after   = o.after  !== undefined ? o.after  : 60;
  const indent  = o.indent ? '<w:ind w:left="' + o.indent + '"/>' : "";
  const shade   = o.fill  ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.fill + '"/>' : "";
  const lines   = String(text || "").split("\n");
  return lines.map(function(line, i) {
    return '<w:p>' +
      '<w:pPr>' + shade + '<w:spacing w:before="' + (i === 0 ? before : 0) + '" w:after="' + (i === lines.length - 1 ? after : 0) + '"/>' + indent + '</w:pPr>' +
      '<w:r><w:rPr>' + bold + italic + '<w:sz w:val="' + sz + '"/><w:color w:val="' + color + '"/></w:rPr>' +
      '<w:t xml:space="preserve">' + xmlEscape(line) + '</w:t></w:r></w:p>';
  }).join("");
};

const whead = (text, level) => {
  const fills  = ["0F172A", "1E3A8A", "1E3A8A"];
  const sizes  = [28, 22, 20];
  const fill   = fills[level - 1] || "0F172A";
  const sz     = sizes[level - 1] || 20;
  return '<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="' + fill + '"/>' +
    '<w:spacing w:before="200" w:after="80"/><w:ind w:left="80"/></w:pPr>' +
    '<w:r><w:rPr><w:b/><w:sz w:val="' + sz + '"/><w:color w:val="FFFFFF"/></w:rPr>' +
    '<w:t xml:space="preserve">' + xmlEscape(text) + '</w:t></w:r></w:p>';
};

const wkv = (label, value) =>
  '<w:tr>' +
    '<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr>' +
    '<w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>' +
    '<w:r><w:rPr><w:b/><w:sz w:val="17"/><w:color w:val="64748B"/></w:rPr><w:t>' + xmlEscape(label) + '</w:t></w:r></w:p></w:tc>' +
    '<w:tc><w:tcPr><w:tcW w:w="6950" w:type="dxa"/></w:tcPr>' +
    '<w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>' +
    '<w:r><w:rPr><w:sz w:val="17"/></w:rPr><w:t>' + xmlEscape(value || "—") + '</w:t></w:r></w:p></w:tc>' +
  '</w:tr>';

const wimg = (rid, widthEmu, heightEmu, label, relId) =>
  '<w:p><w:pPr><w:spacing w:before="60" w:after="40"/></w:pPr><w:r><w:rPr/>' +
    '<w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
      '<wp:extent cx="' + widthEmu + '" cy="' + heightEmu + '"/>' +
      '<wp:docPr id="' + relId + '" name="' + xmlEscape(label) + '"/>' +
      '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
        '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
          '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
            '<pic:nvPicPr><pic:cNvPr id="' + relId + '" name="' + xmlEscape(label) + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
            '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
            '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + widthEmu + '" cy="' + heightEmu + '"/></a:xfrm>' +
              '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
          '</pic:pic>' +
        '</a:graphicData>' +
      '</a:graphic>' +
    '</wp:inline></w:drawing>' +
  '</w:r></w:p>';

const wfindingBadge = (photoNum, defectType, severity, confidence) => {
  const hex    = DEFECT_HEX[defectType] || "6366F1";
  const conf   = confidence ? "  ·  " + Math.round(confidence * 100) + "%" : "";
  const label  = "[" + photoNum + "]  " + (defectType || "").replace(/_/g, " ") + "  ·  " + (SEVERITY_LABEL[severity] || severity) + conf;
  return '<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="' + hex + '"/>' +
    '<w:spacing w:before="40" w:after="40"/><w:ind w:left="80" w:right="80"/></w:pPr>' +
    '<w:r><w:rPr><w:b/><w:sz w:val="17"/><w:color w:val="FFFFFF"/></w:rPr>' +
    '<w:t xml:space="preserve">' + xmlEscape(label) + '</w:t></w:r></w:p>';
};

const wdivider = () =>
  '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="E2E8F0"/></w:pBdr>' +
  '<w:spacing w:before="80" w:after="80"/></w:pPr></w:p>';

export async function exportReportDocx({ report, inspection, findings, photos, groups, creator, header, rows }) {
  const imgRels = [];
  let   relId   = 200;
  let   body    = "";

  body += whead(header.title || report.title || "Inspection Report", 1);
  body += wpara(
    (inspection?.buildings?.name || "") + "  ·  " + (inspection?.inspection_date || "") + "  ·  Prepared by: " + (creator?.name || ""),
    { sz: 17, color: "64748B", before: 60, after: 20 }
  );
  body += wpara(
    "Generated: " + new Date().toLocaleDateString("en-MY", { year: "numeric", month: "long", day: "numeric" }),
    { sz: 16, color: "94A3B8", before: 0, after: 160 }
  );

  body += whead("1.  Inspection Details", 2);
  body += '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="9350" w:type="dxa"/>' +
    '<w:tblBorders>' +
    '<w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>' +
    '<w:insideH w:val="single" w:sz="2" w:color="E2E8F0"/><w:insideV w:val="none"/>' +
    '</w:tblBorders></w:tblPr>';
  [
    ["Building",        inspection?.buildings?.name],
    ["Building Code",   inspection?.buildings?.code],
    ["Inspection Date", inspection?.inspection_date],
    ["Weather",         inspection?.weather_condition],
    ["Floor Level",     inspection?.floor_level],
    ["Area Inspected",  inspection?.area_inspected],
    ["Prepared By",     creator?.name],
    ["Report Date",     new Date(report.created_at).toLocaleDateString("en-MY")],
    ["Report Status",   report.status],
  ].forEach(function(p) { body += wkv(p[0], p[1]); });
  body += "</w:tbl>";

  if (inspection?.description) {
    body += wpara("Site Remarks", { bold: true, sz: 17, color: "64748B", before: 120, after: 40 });
    body += wpara(inspection.description, { sz: 18, before: 0, after: 120 });
  }

  if (header.summary) {
    body += whead("2.  Executive Summary", 2);
    body += wpara(header.summary, { sz: 19, before: 60, after: 120 });
  }

  if (findings.length > 0) {
    body += whead("3.  Summary Statistics", 2);
    const stats = [
      ["Total Findings",  findings.length],
      ["High / Critical", findings.filter(function(f) { return f.severity === "high" || f.severity === "critical"; }).length],
      ["Medium Severity", findings.filter(function(f) { return f.severity === "medium"; }).length],
      ["Low Severity",    findings.filter(function(f) { return f.severity === "low"; }).length],
    ];
    body += '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="9350" w:type="dxa"/>' +
      '<w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders></w:tblPr>';
    body += '<w:tr>';
    const statFills = ["6366F1", "EF4444", "F59E0B", "16A34A"];
    stats.forEach(function(s, i) {
      body += '<w:tc><w:tcPr><w:tcW w:w="2337" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="' + statFills[i] + '"/><w:tcMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/></w:tcMar></w:tcPr>' +
        '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="20"/></w:pPr>' +
        '<w:r><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="FFFFFF"/></w:rPr><w:t>' + s[1] + '</w:t></w:r></w:p>' +
        '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="60"/></w:pPr>' +
        '<w:r><w:rPr><w:sz w:val="14"/><w:color w:val="FFFFFF"/></w:rPr><w:t>' + xmlEscape(s[0]) + '</w:t></w:r></w:p></w:tc>';
    });
    body += '</w:tr></w:tbl>';

    const breakdown = findings.reduce(function(acc, f) { acc[f.defect_type] = (acc[f.defect_type] || 0) + 1; return acc; }, {});
    body += wpara("Defect Breakdown", { bold: true, sz: 17, color: "64748B", before: 120, after: 40 });
    Object.entries(breakdown).forEach(function(entry) {
      const type = entry[0]; const count = entry[1];
      const hex  = DEFECT_HEX[type] || "6366F1";
      body += '<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="' + hex + '"/>' +
        '<w:spacing w:before="30" w:after="30"/><w:ind w:left="80"/>' +
        '<w:rPr><w:b/><w:sz w:val="17"/><w:color w:val="FFFFFF"/></w:rPr></w:pPr>' +
        '<w:r><w:rPr><w:b/><w:sz w:val="17"/><w:color w:val="FFFFFF"/></w:rPr>' +
        '<w:t xml:space="preserve">' + xmlEscape(type.replace(/_/g, " ")) + " \u00d7 " + count + '</w:t></w:r></w:p>';
    });
    body += wpara("", { before: 60, after: 0 });
  }

  body += whead("4.  Findings & Remediation", 2);

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

    body += '<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>';

    body += '<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>' +
      '<w:spacing w:before="80" w:after="80"/><w:ind w:left="80"/></w:pPr>' +
      '<w:r><w:rPr><w:b/><w:sz w:val="21"/><w:color w:val="1E293B"/></w:rPr>' +
      '<w:t xml:space="preserve">' + xmlEscape(displayName) + '</w:t></w:r>' +
      '<w:r><w:rPr><w:sz w:val="17"/><w:color w:val="64748B"/></w:rPr>' +
      '<w:t xml:space="preserve">  ·  ' + groupPhotos.length + ' photo' + (groupPhotos.length !== 1 ? "s" : "") +
        (groupFindings.length ? "  ·  " + groupFindings.length + " finding" + (groupFindings.length !== 1 ? "s" : "") : "") +
      '</w:t></w:r></w:p>';

    body += wpara("Photographs", { bold: true, sz: 17, color: "64748B", before: 100, after: 40 });

    if (hasAnnot) {
      const b64raw = group.annotation.canvas_data.split(",")[1];
      const bin    = atob(b64raw);
      const arr    = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const rid    = "rIdAnnot" + gi;
      imgRels.push({ id: rid, arr: arr, b64: b64raw, ext: "png", type: "image/png" });
      body += wimg(rid, emu(165), emu(108), "annot_" + group.label, relId++);
      body += wpara("Annotated canvas — " + displayName, { italic: true, sz: 15, color: "94A3B8", before: 20, after: 60 });
    } else {
      const imgW = emu(38);
      const imgH = emu(28);
      body += '<w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>';
      for (let pi = 0; pi < Math.min(groupPhotos.length, 4); pi++) {
        const result = await toBase64Bytes(groupPhotos[pi].url);
        if (result) {
          const rid = "rIdPhoto" + gi + "_" + pi;
          imgRels.push({ id: rid, arr: result.arr, b64: result.b64, ext: "jpg", type: "image/jpeg" });
          body += '<w:r><w:rPr/><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
            '<wp:extent cx="' + imgW + '" cy="' + imgH + '"/>' +
            '<wp:docPr id="' + relId + '" name="photo_' + gi + '_' + pi + '"/>' +
            '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
              '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
                '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
                  '<pic:nvPicPr><pic:cNvPr id="' + relId + '" name="p' + pi + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
                  '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
                  '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + imgW + '" cy="' + imgH + '"/></a:xfrm>' +
                    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
                '</pic:pic>' +
              '</a:graphicData></a:graphic>' +
            '</wp:inline></w:drawing></w:r>';
          relId++;
        }
      }
      body += '</w:p>';
      body += wpara(
        groupPhotos.slice(0, 4).map(function(_, i) { return group.label + "." + (i + 1); }).join("     "),
        { sz: 15, color: "64748B", before: 20, after: 60 }
      );
    }

    if (numberedFindings.length > 0) {
      body += wpara("AI Detections", { bold: true, sz: 17, color: "64748B", before: 80, after: 40 });
      numberedFindings.forEach(function(f) {
        body += wfindingBadge(f.photoNum, f.defect_type, f.severity, f.confidence);
      });
    }

    body += wdivider();
    body += wpara("Observed Defects & Findings", { bold: true, sz: 17, color: "64748B", before: 100, after: 40 });
    if (rowData.findings_text) {
      body += wpara(rowData.findings_text, { sz: 18, before: 0, after: 80 });
    } else {
      body += wpara("No findings entered for this group.", { italic: true, sz: 17, color: "94A3B8", before: 0, after: 80 });
    }

    body += wpara("Recommended Remediation Works", { bold: true, sz: 17, color: "64748B", before: 60, after: 40 });
    if (rowData.remediation) {
      body += wpara(rowData.remediation, { sz: 18, before: 0, after: 100 });
    } else {
      body += wpara("No remediation entered for this group.", { italic: true, sz: 17, color: "94A3B8", before: 0, after: 100 });
    }
  }

  if (header.recommendations) {
    body += whead("5.  General Recommendations", 2);
    body += wpara(header.recommendations, { sz: 19, before: 60, after: 120 });
  }

  body += whead("6.  Declaration", 2);
  body += wpara("This report was prepared by:", { sz: 18, before: 80, after: 40 });
  body += wpara(creator?.name || "—", { bold: true, sz: 22, before: 0, after: 40 });
  body += wpara(
    (creator?.email || "") + "  ·  Generated by VIDA System on " +
    new Date().toLocaleDateString("en-MY", { year: "numeric", month: "long", day: "numeric" }),
    { sz: 16, color: "94A3B8", before: 0, after: 120 }
  );

  const relEntries = imgRels.map(function(rel) {
    return '<Relationship Id="' + rel.id + '" ' +
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ' +
      'Target="media/' + rel.id + '.' + rel.ext + '"/>';
  }).join("\n");

  const docXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
    ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"' +
    ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"' +
    ' xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"' +
    ' mc:Ignorable="w14" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">' +
    '<w:body>' + body +
    '<w:sectPr>' +
      '<w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>' +
    '</w:sectPr>' +
    '</w:body></w:document>';

  const relsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    relEntries +
    '</Relationships>';

  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
    '<w:rPr><w:sz w:val="20"/><w:lang w:val="en-MY"/></w:rPr></w:style>' +
    '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style>' +
    '</w:styles>';

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml"  ContentType="application/xml"/>' +
    '<Default Extension="png"  ContentType="image/png"/>' +
    '<Default Extension="jpg"  ContentType="image/jpeg"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml"   ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>';

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';

  await new Promise((resolve, reject) => {
    if (window.JSZip) { resolve(); return; }
    const script  = document.createElement("script");
    script.src    = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    script.onload  = resolve;
    script.onerror = () => reject(new Error("Failed to load JSZip"));
    document.head.appendChild(script);
  });
  const zip = new window.JSZip();

  zip.file("[Content_Types].xml",          contentTypesXml);
  zip.file("_rels/.rels",                  rootRelsXml);
  zip.file("word/document.xml",            docXml);
  zip.file("word/styles.xml",              stylesXml);
  zip.file("word/_rels/document.xml.rels", relsXml);

  imgRels.forEach(function(rel) {
    zip.file("word/media/" + rel.id + "." + rel.ext, rel.arr);
  });

  const blob     = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const safeTitle = (header.title || report.title || "report").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
  const fileName  = "VIDA_Report_" + safeTitle + "_" + new Date().toISOString().slice(0, 10) + ".docx";
  const url       = URL.createObjectURL(blob);
  const a         = document.createElement("a");
  a.href          = url;
  a.download      = fileName;
  a.click();
  URL.revokeObjectURL(url);
}