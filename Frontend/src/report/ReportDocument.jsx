import { FINDING_COLUMNS, SECTION } from "./reportModel.js";

const page = { fontFamily: "Arial, Helvetica, sans-serif", color: "#111827", background: "#ffffff" };

function Heading({ children }) {
  return <h2 className="text-[15px] font-bold mt-7 mb-3 pb-1 border-b border-[#4B5563]" style={{ breakAfter: "avoid" }}>{children}</h2>;
}

function KvTable({ rows, bordered = true }) {
  return (
    <table className="w-full text-[13px] border-collapse">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className={bordered ? "border border-[#BEBEBE]" : ""}>
            <th className={`text-left align-top font-bold py-1.5 px-2 w-[28%] ${bordered ? "border-r border-[#BEBEBE]" : "pl-0"}`}>{label}</th>
            <td className="align-top py-1.5 px-2 whitespace-pre-wrap break-words">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Figure({ image, caption, wide }) {
  return (
    <figure className="m-0 flex flex-col items-center" style={{ breakInside: "avoid" }}>
      <div className={`w-full flex items-start justify-center ${wide ? "" : "h-[240px]"}`}>
        {image
          ? <img src={image.dataUrl} alt={caption} className={`border border-[#BEBEBE] object-contain ${wide ? "max-h-[420px]" : "max-h-[240px]"} max-w-full`}/>
          : <div className="w-full h-40 border border-[#BEBEBE] flex items-center justify-center text-xs text-[#4B5563]">Image could not be loaded</div>}
      </div>
      <figcaption className="text-[12px] text-center mt-1.5">{caption}</figcaption>
    </figure>
  );
}

export default function ReportDocument({ model }) {
  return (
    <div className="mx-auto max-w-[820px] shadow-lg border border-slate-200 px-10 py-8 text-[13px] leading-relaxed" style={page}>
      <header className="flex items-center justify-between border-b border-[#BEBEBE] pb-2 mb-6 text-[11px] text-[#4B5563]">
        <span className="flex items-center gap-2">
          {model.logo && <img src={model.logo.dataUrl} alt="" className="h-7 w-auto"/>}
          VIDA Inspection Report
        </span>
        <span>{model.reportNo}</span>
      </header>

      <h1 className="text-[24px] font-bold leading-tight">{model.title}</h1>
      <p className="text-[#4B5563] mb-3">Building Defect Inspection Report</p>
      <KvTable rows={model.titleRows} bordered={false}/>
      <div className="border-b border-[#4B5563] mt-2"/>

      <Heading>{SECTION.details}</Heading>
      <KvTable rows={model.details}/>

      <Heading>{SECTION.summary}</Heading>
      {model.summary.map((p, i) => <p key={i} className="mb-2 whitespace-pre-wrap">{p}</p>)}
      {model.recommendations && (
        <>
          <h3 className="font-bold mt-3 mb-1">General recommendations</h3>
          <p className="whitespace-pre-wrap">{model.recommendations}</p>
        </>
      )}

      <Heading>{SECTION.findings}</Heading>
      {model.findingRows.length ? (
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="border-y border-[#4B5563]">
              {FINDING_COLUMNS.map(c => <th key={c} className="text-left font-bold py-1.5 px-1.5 align-top">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {model.findingRows.map((row, i) => (
              <tr key={i} className="border-b border-[#BEBEBE]" style={{ breakInside: "avoid" }}>
                {row.map((c, j) => <td key={j} className="py-1.5 px-1.5 align-top">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p>No findings were recorded for this inspection.</p>}

      <Heading>{SECTION.photos}</Heading>
      {model.groups.length === 0 && <p>No photographs were attached to this inspection.</p>}
      {model.groups.map(g => (
        <section key={g.id} className="mb-5">
          <h3 className="font-bold text-[14px] mb-2" style={{ breakAfter: "avoid" }}>{g.heading}</h3>
          {g.figures.length > 0 && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-3">
              {g.figures.map(f => <Figure key={f.id} image={f.image} caption={f.caption}/>)}
            </div>
          )}
          {g.annotation && <div className="mb-3"><Figure image={g.annotationImage} caption={g.annotationCaption} wide/></div>}
          {g.observed && (<><h4 className="font-bold mt-2">Observed defects</h4><p className="whitespace-pre-wrap">{g.observed}</p></>)}
          {g.remediation && (<><h4 className="font-bold mt-2">Recommended works</h4><p className="whitespace-pre-wrap">{g.remediation}</p></>)}
        </section>
      ))}

      <Heading>{SECTION.review}</Heading>
      {model.review ? <KvTable rows={model.review}/> : <p>{model.reviewPending}</p>}

      <Heading>{SECTION.signoff}</Heading>
      <div className="grid grid-cols-2 gap-10 mt-2" style={{ breakInside: "avoid" }}>
        {model.signoff.map(s => (
          <div key={s.role}>
            <p className="font-bold">{s.role}</p>
            <div className="border-b border-[#111827] h-14 mb-2"/>
            <p>Name: {s.name}</p>
            <p>Date: {s.date}</p>
          </div>
        ))}
      </div>

      <footer className="mt-10 pt-2 border-t border-[#BEBEBE] text-center text-[11px] text-[#4B5563]">
        The PDF and Word downloads carry the same content with page numbers.
      </footer>
    </div>
  );
}
