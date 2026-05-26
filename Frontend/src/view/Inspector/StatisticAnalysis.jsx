import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { BarChart2, Filter, X, Search, ArrowUpDown, TrendingUp, AlertTriangle, ClipboardList, Building2, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from "recharts";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

const COLORS = ["#2563eb","#0ea5e9","#8b5cf6","#f59e0b","#10b981","#ef4444","#ec4899"];
const DEFECT_TYPES  = ["crack", "faded_paint", "spalling", "water_stain"];
const SEVERITIES    = ["low", "medium", "high", "critical"];

export default function StatisticAnalysis() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    inspector_id: "",
    building_id:  "",
    defect_type:  "",
    severity:     "",
    date_from:    "",
    date_to:      "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [inspectorSearch, setInspectorSearch] = useState("");
  const [sortBy, setSortBy] = useState({ table: "inspectors", key: "count", dir: "desc" });

  const fetchStats = (f = filters) => {
    setLoading(true);
    const params = Object.fromEntries(Object.entries(f).filter(([_, v]) => v));
    api.get("/inspector/stats", { params })
      .then(r => setStats(r.data))
      .catch(() => toast.error("Failed to load statistics"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchStats(); }, []);

  const applyFilters = () => fetchStats(filters);
  const clearFilters = () => {
    const empty = { inspector_id: "", building_id: "", defect_type: "", severity: "", date_from: "", date_to: "" };
    setFilters(empty);
    fetchStats(empty);
  };

  const role         = stats?.role;
  const canFilterPpl = role === "facility_manager" || role === "admin";

  const filteredInspectorOptions = useMemo(() => {
    if (!stats?.viewable_users) return [];
    return stats.viewable_users.filter(u =>
      u.name?.toLowerCase().includes(inspectorSearch.toLowerCase()) ||
      u.role?.toLowerCase().includes(inspectorSearch.toLowerCase())
    );
  }, [stats?.viewable_users, inspectorSearch]);

  const defectData   = useMemo(() => stats ? Object.entries(stats.findings_by_defect || {}).map(([k, v]) => ({ type: k.replace("_", " "), count: v })) : [], [stats]);
  const statusData   = useMemo(() => stats ? Object.entries(stats.inspections_by_status || {}).map(([k, v]) => ({ name: k, value: v })) : [], [stats]);
  const severityData = useMemo(() => stats ? Object.entries(stats.findings_by_severity || {}).map(([k, v]) => ({ name: k, count: v })) : [], [stats]);

  const sortedTable = (rows) => {
    const dir = sortBy.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortBy.key === "name") return a.name.localeCompare(b.name) * dir;
      return (a.count - b.count) * dir;
    });
  };

  const toggleSort = (table, key) => setSortBy(prev =>
    prev.table === table && prev.key === key
      ? { ...prev, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { table, key, dir: "desc" }
  );

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const pageTitle =
    role === "admin"            ? "Statistics — All Users" :
    role === "facility_manager" ? "Statistics — All Inspectors & My Own" :
                                  "My Statistics";

  if (loading && !stats) return (
    <div className="space-y-6">
      <div className="page-header"><h1 className="page-title">Statistics</h1></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(4)].map((_, i) => <div key={i} className="card p-5"><div className="skeleton h-48 rounded-xl"/></div>)}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><BarChart2 size={22}/> {pageTitle}</h1>
          <p className="page-subtitle">
            {role === "inspector"        && "Overview of your inspection performance"}
            {role === "facility_manager" && "Aggregated across all inspectors and yourself"}
            {role === "admin"            && "System-wide statistics across all users"}
          </p>
        </div>
        <button
          onClick={() => setShowFilters(s => !s)}
          className={`btn-secondary text-xs gap-1.5 ${activeFilterCount > 0 ? "ring-2 ring-primary-500" : ""}`}
        >
          <Filter size={13}/> Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary-600 text-white text-[10px] font-bold">{activeFilterCount}</span>
          )}
        </button>
      </div>

      {showFilters && (
        <motion.div
          className="card p-4 space-y-4"
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2"><Filter size={14}/> Filter Results</h3>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1">
                <X size={12}/> Clear all
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {canFilterPpl && (
              <div>
                <label className="label text-xs">Inspector / User</label>
                <div className="space-y-1">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input
                      value={inspectorSearch}
                      onChange={e => setInspectorSearch(e.target.value)}
                      className="input text-xs pl-7 py-1.5"
                      placeholder="Search users…"
                    />
                  </div>
                  <select
                    value={filters.inspector_id}
                    onChange={e => setFilters(f => ({ ...f, inspector_id: e.target.value }))}
                    className="input text-xs py-1.5"
                  >
                    <option value="">All ({stats?.viewable_users?.length || 0})</option>
                    <option value="__me__">— Just me —</option>
                    {filteredInspectorOptions.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role?.replace("_", " ")})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="label text-xs">Building</label>
              <select
                value={filters.building_id}
                onChange={e => setFilters(f => ({ ...f, building_id: e.target.value }))}
                className="input text-xs py-1.5"
              >
                <option value="">All buildings</option>
                {(stats?.buildings || []).map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </select>
            </div>

            <div>
              <label className="label text-xs">Defect Type</label>
              <select
                value={filters.defect_type}
                onChange={e => setFilters(f => ({ ...f, defect_type: e.target.value }))}
                className="input text-xs py-1.5"
              >
                <option value="">All defects</option>
                {DEFECT_TYPES.map(d => <option key={d} value={d}>{d.replace("_", " ")}</option>)}
              </select>
            </div>

            <div>
              <label className="label text-xs">Severity</label>
              <select
                value={filters.severity}
                onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}
                className="input text-xs py-1.5"
              >
                <option value="">All severities</option>
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="label text-xs">From Date</label>
              <input
                type="date"
                value={filters.date_from}
                onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
                className="input text-xs py-1.5"
              />
            </div>

            <div>
              <label className="label text-xs">To Date</label>
              <input
                type="date"
                value={filters.date_to}
                onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
                className="input text-xs py-1.5"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button onClick={() => setShowFilters(false)} className="btn-secondary text-xs px-3 py-1.5">Close</button>
            <button onClick={applyFilters} className="btn-primary text-xs px-3 py-1.5">Apply Filters</button>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Inspections", value: stats?.total_inspections ?? 0,            color: "bg-primary-600", Icon: ClipboardList },
          { label: "Findings",    value: stats?.total_findings    ?? 0,            color: "bg-amber-500",   Icon: AlertTriangle },
          { label: "Completed",   value: stats?.inspections_by_status?.completed ?? 0, color: "bg-green-600", Icon: TrendingUp },
          { label: canFilterPpl ? "Users" : "Drafts",
            value: canFilterPpl ? (stats?.viewable_users?.length ?? 0) : (stats?.inspections_by_status?.draft ?? 0),
            color: "bg-violet-600", Icon: canFilterPpl ? Users : ClipboardList },
        ].map((s, i) => (
          <motion.div key={i} className="card p-4 flex items-center gap-3" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${s.color} shrink-0`}>
              <s.Icon size={18} className="text-white"/>
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{s.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{s.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">Findings by Defect Type</h3>
          {defectData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={defectData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                <XAxis dataKey="type" tick={{ fontSize: 11 }}/>
                <YAxis tick={{ fontSize: 11 }}/>
                <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "13px" }}/>
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]}/>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400 text-center py-16">No findings recorded</p>}
        </motion.div>

        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">Inspections by Status</h3>
          {statusData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "13px" }}/>
                <Legend wrapperStyle={{ fontSize: "12px" }}/>
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400 text-center py-16">No inspections yet</p>}
        </motion.div>

        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">Monthly Inspection Trend</h3>
          {stats?.monthly_trend?.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={stats.monthly_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                <XAxis dataKey="month" tick={{ fontSize: 11 }}/>
                <YAxis tick={{ fontSize: 11 }}/>
                <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "13px" }}/>
                <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }}/>
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400 text-center py-16">No trend data</p>}
        </motion.div>

        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">Findings by Severity</h3>
          {severityData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={severityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                <XAxis dataKey="name" tick={{ fontSize: 11 }}/>
                <YAxis tick={{ fontSize: 11 }}/>
                <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "13px" }}/>
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {severityData.map((entry, i) => (
                    <Cell key={i} fill={
                      entry.name === "critical" ? "#ef4444" :
                      entry.name === "high"     ? "#f59e0b" :
                      entry.name === "medium"   ? "#0ea5e9" :
                                                  "#10b981"
                    }/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400 text-center py-16">No severity data</p>}
        </motion.div>
      </div>

      <div className={`grid grid-cols-1 ${canFilterPpl ? "lg:grid-cols-2" : ""} gap-6`}>
        {canFilterPpl && (
          <motion.div className="card overflow-hidden" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.52 }}>
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2"><Users size={16}/> Top Inspectors</h3>
              <div className="flex gap-1">
                <button onClick={() => toggleSort("inspectors", "name")}  className={`text-xs px-2 py-1 rounded-md flex items-center gap-1 ${sortBy.table==="inspectors"&&sortBy.key==="name"  ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}><ArrowUpDown size={11}/> Name</button>
                <button onClick={() => toggleSort("inspectors", "count")} className={`text-xs px-2 py-1 rounded-md flex items-center gap-1 ${sortBy.table==="inspectors"&&sortBy.key==="count" ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}><ArrowUpDown size={11}/> Count</button>
              </div>
            </div>
            {stats?.by_inspector?.length ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                {sortedTable(stats.by_inspector).map((row, i) => (
                  <div key={i} className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-400 w-5">#{i+1}</span>
                      <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xs font-bold text-primary-700 dark:text-primary-300">
                        {row.name?.[0]?.toUpperCase() || "?"}
                      </div>
                      <span className="text-sm text-slate-700 dark:text-slate-300">{row.name}</span>
                    </div>
                    <span className="badge-blue">{row.count}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-slate-400 text-center py-12">No data</p>}
          </motion.div>
        )}

        <motion.div className="card overflow-hidden" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2"><Building2 size={16}/> Top Buildings</h3>
            <div className="flex gap-1">
              <button onClick={() => toggleSort("buildings", "name")}  className={`text-xs px-2 py-1 rounded-md flex items-center gap-1 ${sortBy.table==="buildings"&&sortBy.key==="name"  ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}><ArrowUpDown size={11}/> Name</button>
              <button onClick={() => toggleSort("buildings", "count")} className={`text-xs px-2 py-1 rounded-md flex items-center gap-1 ${sortBy.table==="buildings"&&sortBy.key==="count" ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}><ArrowUpDown size={11}/> Count</button>
            </div>
          </div>
          {stats?.by_building?.length ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
              {sortedTable(stats.by_building).map((row, i) => (
                <div key={i} className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-400 w-5">#{i+1}</span>
                    <div className="w-7 h-7 rounded-md bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <Building2 size={13} className="text-amber-600 dark:text-amber-400"/>
                    </div>
                    <span className="text-sm text-slate-700 dark:text-slate-300">{row.name}</span>
                  </div>
                  <span className="badge-blue">{row.count}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-400 text-center py-12">No data</p>}
        </motion.div>
      </div>
    </div>
  );
}