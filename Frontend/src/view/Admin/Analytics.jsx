import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, Download, TrendingUp, AlertTriangle, ClipboardList,
  Users, Building2, FileText, Activity, Filter, X,
  ArrowUpDown, Search, Calendar,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, LineChart, Line, ComposedChart,
} from "recharts";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

const DEFECT_COLORS = {
  crack:         "#ef4444",
  faded_paint:   "#f59e0b",
  spalling:      "#8b5cf6",
  water_stain:   "#3b82f6",
  rust:          "#b45309",
  mold:          "#16a34a",
  efflorescence: "#64748b",
};
const SEV_COLORS   = { critical:"#7c3aed", high:"#ef4444", medium:"#f59e0b", low:"#10b981" };
const CHART_COLORS = ["#2563eb","#0ea5e9","#8b5cf6","#f59e0b","#10b981","#ef4444","#ec4899"];

function StatCard({ label, value, icon: Icon, color, delay = 0 }) {
  return (
    <motion.div className="card p-4 flex items-center gap-3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <div className={"w-12 h-12 rounded-xl flex items-center justify-center shrink-0 " + color}>
        <Icon size={20} className="text-white"/>
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 dark:text-white">{value ?? "—"}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </motion.div>
  );
}

function SortableLeaderboard({ title, icon: Icon, rows, nameKey = "name", countKey = "count", subKey }) {
  const [search,  setSearch]  = useState("");
  const [sortDir, setSortDir] = useState("desc");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (rows || []).filter(r => String(r[nameKey] || "").toLowerCase().includes(q));
  }, [rows, search, nameKey]);

  const sorted = useMemo(() => {
    const dir = sortDir === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => (a[countKey] - b[countKey]) * dir);
  }, [filtered, sortDir, countKey]);

  const max = sorted[0]?.[countKey] || 1;

  return (
    <motion.div className="card overflow-hidden" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
            <Icon size={14}/> {title}
            <span className="text-xs text-slate-400 font-normal">({sorted.length})</span>
          </h3>
          <button
            onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
            className="text-xs px-2 py-1 rounded-lg flex items-center gap-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ArrowUpDown size={10}/> {sortDir === "desc" ? "Most first" : "Least first"}
          </button>
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)} className="input text-xs pl-7 py-1.5" placeholder={"Search " + title.toLowerCase() + "…"}/>
        </div>
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No data</p>
      ) : (
        <div className="divide-y divide-slate-50 dark:divide-slate-800/50 max-h-72 overflow-y-auto">
          {sorted.map((row, i) => (
            <div key={row[nameKey] + i} className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/30">
              <span className="text-xs font-mono text-slate-300 dark:text-slate-600 w-5 shrink-0">#{i+1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 dark:text-slate-300 truncate font-medium">{row[nameKey]}</p>
                {subKey && row[subKey] && <p className="text-[10px] text-slate-400">{row[subKey]}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-20 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full bg-primary-500" style={{ width: Math.min(100, (row[countKey] / max) * 100) + "%" }}/>
                </div>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 w-5 text-right">{row[countKey]}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export default function Analytics() {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filters,     setFilters]     = useState({ date_from: "", date_to: "", building_id: "", inspector_id: "" });

  const fetchData = (f = filters) => {
    setLoading(true);
    const params = Object.fromEntries(Object.entries(f).filter(([_, v]) => v));
    api.get("/admin/analytics", { params })
      .then(r => setData(r.data))
      .catch(() => toast.error("Failed to load analytics"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const activeFilters = Object.values(filters).filter(Boolean).length;

  const exportReport = async () => {
    if (!data) return;
    await new Promise((resolve, reject) => {
      if (window.JSZip) { resolve(); return; }
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = resolve; s.onerror = () => reject(new Error("JSZip failed to load"));
      document.head.appendChild(s);
    });

    const now      = new Date();
    const dateStr  = now.toLocaleDateString("en-MY", { year:"numeric", month:"long", day:"numeric" });
    const safeDate = now.toISOString().slice(0, 10);

    const esc = (v) => String(v ?? "—").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const cell  = (v, bold, color, align) => {
      const b = bold  ? "<b/>"                                          : "";
      const c = color ? '<color theme="1" tint="-0.25"/>'               : "";
      const a = align ? '<alignment horizontal="' + align + '"/>'       : "";
      const bg = color ? '<patternFill patternType="solid"><fgColor rgb="' + color + '"/></patternFill>' : "";
      return '<c t="inlineStr"><is><t>' + esc(v) + '</t></is></c>';
    };

    const mkSheet = (title, rows) => {
      const maxCols = Math.max(...rows.map(r => r.length));
      let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
      xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
      xml += '<sheetData>';
      xml += '<row><c t="inlineStr"><is><t>' + esc(title) + '</t></is></c></row>';
      xml += '<row><c t="inlineStr"><is><t>Generated: ' + esc(dateStr) + '</t></is></c></row>';
      xml += '<row/>';
      rows.forEach(row => {
        xml += '<row>' + row.map(v => '<c t="inlineStr"><is><t>' + esc(v) + '</t></is></c>').join('') + '</row>';
      });
      xml += '</sheetData></worksheet>';
      return xml;
    };

    const overviewRows = [
      ["Metric", "Value"],
      ["Total Users",       data.totals?.users],
      ["Total Buildings",   data.totals?.buildings],
      ["Total Inspections", data.totals?.inspections],
      ["Total Findings",    data.totals?.findings],
      ["Total Reports",     data.totals?.reports],
    ];
    const defectRows = [["Defect Type", "Count"], ...(data.defect_by_type || []).map(d => [d.type?.replace(/_/g," "), d.count])];
    const sevRows    = [["Severity", "Count"],    ...(data.defect_by_severity || []).map(d => [d.severity, d.count])];
    const statusRows = [["Status", "Count"],      ...(data.status_breakdown || []).map(d => [d.status, d.count])];
    const monthInspRows = [["Month", "Inspections"], ...(data.monthly_inspections || []).map(d => [d.month, d.count])];
    const monthFindRows = [["Month", "Findings"],    ...(data.monthly_findings || []).map(d => [d.month, d.count])];
    const inspRows   = [["Inspector", "Inspections"], ...(data.by_inspector || []).map(d => [d.name, d.count])];
    const bldgRows   = [["Building", "Code", "Inspections"], ...(data.by_building || []).map(d => [d.name, d.code, d.count])];

    const wbXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      ['Overview','Defects by Type','Severity','Status','Monthly Inspections','Monthly Findings','By Inspector','By Building'].map((n, i) =>
        '<sheet name="' + esc(n) + '" sheetId="' + (i+1) + '" r:id="rId' + (i+1) + '"/>'
      ).join('') + '</sheets></workbook>';

    const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      [1,2,3,4,5,6,7,8].map(i => '<Relationship Id="rId' + i + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + i + '.xml"/>').join('') +
      '</Relationships>';

    const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      [1,2,3,4,5,6,7,8].map(i => '<Override PartName="/xl/worksheets/sheet' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
      '</Types>';

    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';

    const zip = new window.JSZip();
    zip.file("[Content_Types].xml", ct);
    zip.file("_rels/.rels", rootRels);
    zip.file("xl/workbook.xml", wbXml);
    zip.file("xl/_rels/workbook.xml.rels", wbRels);
    const sheets = [
      ["Overview",              overviewRows],
      ["Defects by Type",       defectRows],
      ["Severity Distribution", sevRows],
      ["Inspection Status",     statusRows],
      ["Monthly Inspections",   monthInspRows],
      ["Monthly Findings",      monthFindRows],
      ["By Inspector",          inspRows],
      ["By Building",           bldgRows],
    ];
    sheets.forEach(([title, rows], i) => {
      zip.file("xl/worksheets/sheet" + (i+1) + ".xml", mkSheet("VIDA Analytics — " + title, rows));
    });

    const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "VIDA_Analytics_" + safeDate + ".xlsx"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Analytics exported as Excel");
  };

  const defectData   = useMemo(() => (data?.defect_by_type || []).map(d => ({ ...d, label: d.type?.replace(/_/g, " ") })), [data]);
  const severityData = useMemo(() => (data?.defect_by_severity || []).map(d => ({ name: d.severity, count: d.count })), [data]);
  const statusData   = useMemo(() => (data?.status_breakdown || []).map(d => ({ name: d.status, value: d.count })), [data]);

  const combinedMonthly = useMemo(() => {
    const months = new Set([
      ...(data?.monthly_inspections || []).map(d => d.month),
      ...(data?.monthly_findings    || []).map(d => d.month),
    ]);
    const inspMap = Object.fromEntries((data?.monthly_inspections || []).map(d => [d.month, d.count]));
    const findMap = Object.fromEntries((data?.monthly_findings    || []).map(d => [d.month, d.count]));
    return [...months].sort().map(m => ({ month: m, inspections: inspMap[m] || 0, findings: findMap[m] || 0 }));
  }, [data]);

  if (loading && !data) return (
    <div className="space-y-6">
      <div className="page-header"><h1 className="page-title">Analytics</h1></div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">{[...Array(5)].map((_, i) => <div key={i} className="card p-4"><div className="skeleton h-16 rounded-xl"/></div>)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{[...Array(4)].map((_, i) => <div key={i} className="card p-5"><div className="skeleton h-52 rounded-xl"/></div>)}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><BarChart3 size={22}/> Analytics</h1>
          <p className="page-subtitle">System-wide overview — all users, buildings, and defect trends</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(s => !s)}
            className={"btn-secondary flex items-center gap-1.5 text-sm " + (activeFilters > 0 ? "ring-2 ring-primary-500" : "")}
          >
            <Filter size={13}/> Filters
            {activeFilters > 0 && <span className="px-1.5 py-0.5 rounded-full bg-primary-600 text-white text-[10px] font-bold">{activeFilters}</span>}
          </button>
          <button onClick={exportReport} className="btn-primary flex items-center gap-2 text-sm">
            <Download size={14}/> Export Excel
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div className="card p-4 space-y-4" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2"><Filter size={13}/> Filter Analytics</h3>
              {activeFilters > 0 && (
                <button onClick={() => { const e = { date_from: "", date_to: "", building_id: "", inspector_id: "" }; setFilters(e); fetchData(e); }} className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1">
                  <X size={11}/> Clear all
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="label text-xs flex items-center gap-1"><Calendar size={11}/> From Date</label>
                <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({...f, date_from: e.target.value}))} className="input text-xs py-1.5"/>
              </div>
              <div>
                <label className="label text-xs flex items-center gap-1"><Calendar size={11}/> To Date</label>
                <input type="date" value={filters.date_to} onChange={e => setFilters(f => ({...f, date_to: e.target.value}))} className="input text-xs py-1.5"/>
              </div>
              <div>
                <label className="label text-xs flex items-center gap-1"><Building2 size={11}/> Building</label>
                <select value={filters.building_id} onChange={e => setFilters(f => ({...f, building_id: e.target.value}))} className="input text-xs py-1.5">
                  <option value="">All buildings</option>
                  {(data?.buildings || []).map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs flex items-center gap-1"><Users size={11}/> Inspector / User</label>
                <select value={filters.inspector_id} onChange={e => setFilters(f => ({...f, inspector_id: e.target.value}))} className="input text-xs py-1.5">
                  <option value="">All users</option>
                  {(data?.inspectors || []).map(u => <option key={u.id} value={u.id}>{u.name} ({u.role?.replace("_"," ")})</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setShowFilters(false)} className="btn-secondary text-xs px-3 py-1.5">Close</button>
              <button onClick={() => fetchData(filters)} className="btn-primary text-xs px-3 py-1.5">Apply</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard label="Users"        value={data?.totals?.users}        icon={Users}         color="bg-primary-600"  delay={0}/>
        <StatCard label="Buildings"    value={data?.totals?.buildings}    icon={Building2}     color="bg-amber-500"    delay={0.04}/>
        <StatCard label="Inspections"  value={data?.totals?.inspections}  icon={ClipboardList} color="bg-emerald-600"  delay={0.08}/>
        <StatCard label="Findings"     value={data?.totals?.findings}     icon={AlertTriangle} color="bg-red-500"      delay={0.12}/>
        <StatCard label="Reports"      value={data?.totals?.reports}      icon={FileText}      color="bg-violet-600"   delay={0.16}/>
      </div>

      <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-4 flex items-center gap-2">
          <Activity size={14} className="text-primary-600"/> Monthly Overview — Inspections vs Findings
        </h3>
        {combinedMonthly.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={combinedMonthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
              <XAxis dataKey="month" tick={{ fontSize: 10 }}/>
              <YAxis tick={{ fontSize: 10 }}/>
              <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "12px" }}/>
              <Legend wrapperStyle={{ fontSize: "11px" }}/>
              <Bar dataKey="inspections" fill="#2563eb" radius={[3,3,0,0]} name="Inspections"/>
              <Line type="monotone" dataKey="findings" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3 }} name="Findings"/>
            </ComposedChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-slate-400 text-center py-16">No data for selected period</p>}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-4 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-500"/> Defects by Type
          </h3>
          {defectData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={defectData} margin={{ bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={54}/>
                <YAxis tick={{ fontSize: 10 }}/>
                <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "12px" }}/>
                <Bar dataKey="count" radius={[4,4,0,0]}>
                  {defectData.map((d, i) => <Cell key={i} fill={DEFECT_COLORS[d.type] || CHART_COLORS[i % CHART_COLORS.length]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400 text-center py-16">No defect data</p>}
        </motion.div>

        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-4 flex items-center gap-2">
            <TrendingUp size={14} className="text-violet-600"/> Severity Distribution
          </h3>
          {severityData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={severityData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ name, percent }) => name + " " + (percent*100).toFixed(0) + "%"}>
                  {severityData.map((d, i) => <Cell key={i} fill={SEV_COLORS[d.name] || CHART_COLORS[i]}/>)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "12px" }}/>
                <Legend wrapperStyle={{ fontSize: "11px" }}/>
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400 text-center py-16">No severity data</p>}
        </motion.div>

        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-4 flex items-center gap-2">
            <ClipboardList size={14} className="text-emerald-600"/> Inspection Status Breakdown
          </h3>
          {statusData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ name, percent }) => name + " " + (percent*100).toFixed(0) + "%"}>
                  {statusData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]}/>)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "12px" }}/>
                <Legend wrapperStyle={{ fontSize: "11px" }}/>
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400 text-center py-16">No status data</p>}
        </motion.div>

        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-4 flex items-center gap-2">
            <BarChart3 size={14} className="text-slate-500"/> Defect Summary
          </h3>
          <div className="space-y-2.5">
            {defectData.map((d, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ background: DEFECT_COLORS[d.type] || CHART_COLORS[i] }}/>
                <span className="text-sm text-slate-600 dark:text-slate-400 flex-1 capitalize">{d.label}</span>
                <div className="w-24 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: Math.min(100, (d.count / (defectData[0]?.count || 1)) * 100) + "%", background: DEFECT_COLORS[d.type] || CHART_COLORS[i] }}/>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white w-6 text-right">{d.count}</span>
              </div>
            ))}
            {!defectData.length && <p className="text-sm text-slate-400 text-center py-8">No data yet</p>}
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SortableLeaderboard
          title="Inspector Activity"
          icon={Users}
          rows={data?.by_inspector || []}
        />
        <SortableLeaderboard
          title="Building Activity"
          icon={Building2}
          rows={data?.by_building || []}
          subKey="code"
        />
      </div>
    </div>
  );
}