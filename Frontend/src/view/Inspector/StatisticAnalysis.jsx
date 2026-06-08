import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2, Filter, X, Search, ArrowUpDown, TrendingUp, AlertTriangle,
  ClipboardList, Building2, Users, Info, Download, ChevronDown,
  BarChart3, PieChart as PieIcon, Activity, Calendar,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area, ComposedChart,
} from "recharts";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext.jsx";

const DEFECT_COLORS_MAP = {
  crack:         "#ef4444",
  faded_paint:   "#f59e0b",
  spalling:      "#8b5cf6",
  water_stain:   "#3b82f6",
  rust:          "#b45309",
  mold:          "#16a34a",
  efflorescence: "#64748b",
};
const CHART_COLORS  = ["#2563eb","#0ea5e9","#8b5cf6","#f59e0b","#10b981","#ef4444","#ec4899"];
const DEFECT_TYPES  = ["crack","faded_paint","spalling","water_stain","rust","mold","efflorescence"];
const SEVERITIES    = ["low","medium","high","critical"];
const SEV_COLORS    = { critical:"#7c3aed", high:"#ef4444", medium:"#f59e0b", low:"#10b981" };

function RoleNotice({ role }) {
  const notices = {
    inspector:        { icon: "🔒", color: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300", text: "You can only view statistics for your own inspections and findings." },
    facility_manager: { icon: "👥", color: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300", text: "You can view statistics for all inspectors, plus your own activity as facility manager." },
    admin:            { icon: "🛡️", color: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300", text: "Full access — you can view and export statistics for all users across the entire system." },
  };
  const n = notices[role];
  if (!n) return null;
  return (
    <motion.div className={"flex items-start gap-2.5 p-3 rounded-xl border text-sm " + n.color} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
      <span className="text-base leading-none mt-0.5">{n.icon}</span>
      <p>{n.text}</p>
    </motion.div>
  );
}

function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <motion.div className="card p-4 flex items-center gap-3" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <div className={"w-11 h-11 rounded-xl flex items-center justify-center shrink-0 " + color}>
        <Icon size={18} className="text-white"/>
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">{value}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{label}</p>
        {sub && <p className="text-[10px] text-slate-400 truncate">{sub}</p>}
      </div>
    </motion.div>
  );
}

function SortableTable({ title, icon: Icon, rows, isInspectors, avatarKey }) {
  const [search,  setSearch]  = useState("");
  const [sortKey, setSortKey] = useState("count");
  const [sortDir, setSortDir] = useState("desc");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (rows || []).filter(r => r.name?.toLowerCase().includes(q));
  }, [rows, search]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) =>
      sortKey === "name" ? a.name.localeCompare(b.name) * dir : (a.count - b.count) * dir
    );
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  return (
    <motion.div className="card overflow-hidden" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
            <Icon size={15}/> {title}
            <span className="text-xs text-slate-400 font-normal">({sorted.length})</span>
          </h3>
          <div className="flex gap-1">
            <button onClick={() => toggleSort("name")} className={"text-xs px-2 py-1 rounded-md flex items-center gap-1 " + (sortKey==="name" ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800")}>
              <ArrowUpDown size={10}/> Name
            </button>
            <button onClick={() => toggleSort("count")} className={"text-xs px-2 py-1 rounded-md flex items-center gap-1 " + (sortKey==="count" ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800")}>
              <ArrowUpDown size={10}/> Count
            </button>
          </div>
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)} className="input text-xs pl-7 py-1.5" placeholder={"Search " + title.toLowerCase() + "…"}/>
        </div>
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">No data</p>
      ) : (
        <div className="divide-y divide-slate-50 dark:divide-slate-800/50 max-h-80 overflow-y-auto">
          {sorted.map((row, i) => (
            <div key={row.name + i} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/30">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-mono text-slate-300 dark:text-slate-600 w-4 shrink-0">#{i+1}</span>
                {isInspectors ? (
                  <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xs font-bold text-primary-700 dark:text-primary-300 shrink-0 overflow-hidden">
                    {row.avatar_url ? <img src={row.avatar_url} alt={row.name} className="w-full h-full object-cover"/> : (row.name?.[0]?.toUpperCase() || "?")}
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <Building2 size={13} className="text-amber-600 dark:text-amber-400"/>
                  </div>
                )}
                <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{row.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full bg-primary-500" style={{ width: Math.min(100, (row.count / (sorted[0]?.count || 1)) * 100) + "%" }}/>
                </div>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 w-6 text-right">{row.count}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export default function StatisticAnalysis() {
  const { user } = useAuth();
  const [stats,       setStats]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [inspSearch,  setInspSearch]  = useState("");
  const [filters,     setFilters]     = useState({ inspector_id:"", building_id:"", defect_type:"", severity:"", date_from:"", date_to:"" });
  const isAdmin = user?.role === "admin";
  const isFM    = user?.role === "facility_manager";
  const canFilter = isAdmin || isFM;

  const fetchStats = (f = filters) => {
    setLoading(true);
    const params = Object.fromEntries(Object.entries(f).filter(([_, v]) => v));
    api.get("/inspector/stats", { params })
      .then(r => setStats(r.data))
      .catch(() => toast.error("Failed to load statistics"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchStats(); }, []);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const defectData   = useMemo(() => stats ? Object.entries(stats.findings_by_defect || {}).map(([k, v]) => ({ type: k.replace(/_/g," "), key: k, count: v })) : [], [stats]);
  const statusData   = useMemo(() => stats ? Object.entries(stats.inspections_by_status || {}).map(([k, v]) => ({ name: k, value: v })) : [], [stats]);
  const severityData = useMemo(() => stats ? Object.entries(stats.findings_by_severity || {}).map(([k, v]) => ({ name: k, count: v })) : [], [stats]);

  const inspectorOptions = useMemo(() => {
    if (!stats?.viewable_users) return [];
    return stats.viewable_users.filter(u => u.name?.toLowerCase().includes(inspSearch.toLowerCase()));
  }, [stats?.viewable_users, inspSearch]);

  const exportCSV = () => {
    if (!stats) return;
    const rows = [
      ["Metric", "Value"],
      ["Total Inspections", stats.total_inspections],
      ["Total Findings",    stats.total_findings],
      ...Object.entries(stats.inspections_by_status || {}).map(([k,v]) => ["Status: " + k, v]),
      ...Object.entries(stats.findings_by_defect   || {}).map(([k,v]) => ["Defect: " + k, v]),
      ...Object.entries(stats.findings_by_severity || {}).map(([k,v]) => ["Severity: " + k, v]),
    ];
    const csv  = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url; a.download = "VIDA_Statistics_" + new Date().toISOString().slice(0,10) + ".csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Statistics exported as CSV");
  };

  if (loading && !stats) return (
    <div className="space-y-6">
      <div className="page-header"><h1 className="page-title">Statistics</h1></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(4)].map((_, i) => <div key={i} className="card p-5"><div className="skeleton h-48 rounded-xl"/></div>)}
      </div>
    </div>
  );

  const role = stats?.role || user?.role;

  return (
    <div className="space-y-6">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><BarChart2 size={22}/>
            {isAdmin ? "Statistics — All Users" : isFM ? "Statistics — My Team" : "My Statistics"}
          </h1>
          <p className="page-subtitle">
            {isAdmin ? "System-wide analytics across all users and inspections" :
             isFM    ? "Aggregated data for all inspectors and your own activity" :
                       "Overview of your own inspection and finding activity"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={exportCSV} className="btn-secondary text-xs flex items-center gap-1.5">
              <Download size={13}/> Export CSV
            </button>
          )}
          <button
            onClick={() => setShowFilters(s => !s)}
            className={"btn-secondary text-xs flex items-center gap-1.5 " + (activeFilterCount > 0 ? "ring-2 ring-primary-500" : "")}
          >
            <Filter size={13}/> Filters
            {activeFilterCount > 0 && <span className="px-1.5 py-0.5 rounded-full bg-primary-600 text-white text-[10px] font-bold">{activeFilterCount}</span>}
          </button>
        </div>
      </div>

      <RoleNotice role={role}/>

      <AnimatePresence>
        {showFilters && (
          <motion.div className="card p-4 space-y-4" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2"><Filter size={14}/> Filter Results</h3>
              {activeFilterCount > 0 && (
                <button onClick={() => { const e = { inspector_id:"", building_id:"", defect_type:"", severity:"", date_from:"", date_to:"" }; setFilters(e); fetchStats(e); }} className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1">
                  <X size={12}/> Clear all
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {canFilter && (
                <div>
                  <label className="label text-xs">Inspector / User</label>
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                      <input value={inspSearch} onChange={e => setInspSearch(e.target.value)} className="input text-xs pl-7 py-1.5" placeholder="Search users…"/>
                    </div>
                    <select value={filters.inspector_id} onChange={e => setFilters(f => ({...f, inspector_id: e.target.value}))} className="input text-xs py-1.5">
                      <option value="">All ({stats?.viewable_users?.length || 0})</option>
                      <option value="__me__">— Just my activity —</option>
                      {inspectorOptions.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role?.replace("_"," ")})</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div>
                <label className="label text-xs">Building</label>
                <select value={filters.building_id} onChange={e => setFilters(f => ({...f, building_id: e.target.value}))} className="input text-xs py-1.5">
                  <option value="">All buildings</option>
                  {(stats?.buildings || []).map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Defect Type</label>
                <select value={filters.defect_type} onChange={e => setFilters(f => ({...f, defect_type: e.target.value}))} className="input text-xs py-1.5">
                  <option value="">All defects</option>
                  {DEFECT_TYPES.map(d => <option key={d} value={d}>{d.replace(/_/g," ")}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Severity</label>
                <select value={filters.severity} onChange={e => setFilters(f => ({...f, severity: e.target.value}))} className="input text-xs py-1.5">
                  <option value="">All severities</option>
                  {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">From Date</label>
                <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({...f, date_from: e.target.value}))} className="input text-xs py-1.5"/>
              </div>
              <div>
                <label className="label text-xs">To Date</label>
                <input type="date" value={filters.date_to} onChange={e => setFilters(f => ({...f, date_to: e.target.value}))} className="input text-xs py-1.5"/>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setShowFilters(false)} className="btn-secondary text-xs px-3 py-1.5">Close</button>
              <button onClick={() => fetchStats(filters)} className="btn-primary text-xs px-3 py-1.5">Apply Filters</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Inspections" value={stats?.total_inspections ?? 0}            color="bg-primary-600"  icon={ClipboardList}/>
        <StatCard label="Total Findings"    value={stats?.total_findings    ?? 0}            color="bg-amber-500"    icon={AlertTriangle}/>
        <StatCard label="Submitted"         value={stats?.inspections_by_status?.submitted ?? 0} color="bg-emerald-600" icon={TrendingUp}/>
        <StatCard label={canFilter ? "Users Tracked" : "Draft Inspections"}
                  value={canFilter ? (stats?.viewable_users?.length ?? 0) : (stats?.inspections_by_status?.draft ?? 0)}
                  color="bg-violet-600" icon={canFilter ? Users : ClipboardList}/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-4 flex items-center gap-2"><BarChart3 size={14} className="text-primary-600"/> Findings by Defect Type</h3>
          {defectData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={defectData} margin={{ bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                <XAxis dataKey="type" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50}/>
                <YAxis tick={{ fontSize: 10 }}/>
                <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "12px" }}/>
                <Bar dataKey="count" radius={[4,4,0,0]}>
                  {defectData.map((d, i) => <Cell key={i} fill={DEFECT_COLORS_MAP[d.key] || CHART_COLORS[i % CHART_COLORS.length]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400 text-center py-16">No findings recorded</p>}
        </motion.div>

        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-4 flex items-center gap-2"><PieIcon size={14} className="text-amber-600"/> Inspections by Status</h3>
          {statusData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => name + " " + (percent*100).toFixed(0) + "%"}>
                  {statusData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]}/>)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "12px" }}/>
                <Legend wrapperStyle={{ fontSize: "11px" }}/>
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400 text-center py-16">No inspections yet</p>}
        </motion.div>

        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-4 flex items-center gap-2"><Activity size={14} className="text-emerald-600"/> Monthly Inspection Trend</h3>
          {stats?.monthly_trend?.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stats.monthly_trend}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                <XAxis dataKey="month" tick={{ fontSize: 10 }}/>
                <YAxis tick={{ fontSize: 10 }}/>
                <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "12px" }}/>
                <Area type="monotone" dataKey="count" stroke="#2563eb" fill="url(#areaGrad)" strokeWidth={2.5} dot={{ r: 3 }}/>
              </AreaChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400 text-center py-16">No trend data</p>}
        </motion.div>

        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-4 flex items-center gap-2"><Calendar size={14} className="text-violet-600"/> Findings by Severity</h3>
          {severityData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={severityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                <XAxis dataKey="name" tick={{ fontSize: 11 }}/>
                <YAxis tick={{ fontSize: 11 }}/>
                <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "12px" }}/>
                <Bar dataKey="count" radius={[4,4,0,0]}>
                  {severityData.map((e, i) => <Cell key={i} fill={SEV_COLORS[e.name] || CHART_COLORS[i]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400 text-center py-16">No severity data</p>}
        </motion.div>
      </div>

      {stats?.findings_monthly_trend?.length > 0 && (
        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-4 flex items-center gap-2"><TrendingUp size={14} className="text-red-500"/> Monthly Findings Trend</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={stats.findings_monthly_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
              <XAxis dataKey="month" tick={{ fontSize: 10 }}/>
              <YAxis tick={{ fontSize: 10 }}/>
              <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "12px" }}/>
              <Line type="monotone" dataKey="count" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3 }}/>
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      <div className={`grid grid-cols-1 ${canFilter ? "lg:grid-cols-2" : ""} gap-6`}>
        {canFilter && (
          <SortableTable
            title="Inspector Activity"
            icon={Users}
            rows={stats?.by_inspector || []}
            isInspectors={true}
          />
        )}
        <SortableTable
          title="Top Buildings"
          icon={Building2}
          rows={stats?.by_building || []}
          isInspectors={false}
        />
      </div>

      {canFilter && stats?.viewable_users?.length > 0 && (
        <motion.div className="card overflow-hidden" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44 }}>
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2"><Users size={14}/> User Directory</h3>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-800/50 max-h-72 overflow-y-auto">
            {stats.viewable_users.map((u, i) => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xs font-bold text-primary-700 dark:text-primary-300 shrink-0 overflow-hidden">
                  {u.avatar_url ? <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover"/> : (u.name?.[0]?.toUpperCase() || "?")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{u.name}</p>
                  {u.employee_id && <p className="text-[10px] text-slate-400">{u.employee_id}</p>}
                </div>
                <span className={"text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize " + (u.role === "admin" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : u.role === "facility_manager" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400")}>
                  {u.role?.replace("_"," ")}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}