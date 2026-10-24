export async function exportReport(format, payload) {
  if (format === "pdf") {
    const { exportReportPdf } = await import("./pdfReport.js");
    return exportReportPdf(payload);
  }
  const { exportReportDocx } = await import("./docxReport.js");
  return exportReportDocx(payload);
}
