import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { BarChart2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import api from "../../api/axios.js";

const COLORS = ["#2563eb","#0ea5e9","#8b5cf6","#f59e0b","#10b981","#ef4444"];

export default function StatisticAnalysis() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/inspector/stats").then(r => setStats(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const defectData = stats ? Object.entries(stats.findings_by_defect || {}).map(([k,v]) => ({ type: k.replace("_"," "), count: v })) : [];
  const statusData = stats ? Object.entries(stats.inspections_by_status || {}).map(([k,v]) => ({ name: k, value: v })) : [];

  if (loading) return (
    <div className="space-y-6">
      <div className="page-header"><h1 className="page-title">Statistics</h1></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{[...Array(4)].map((_,i)=><div key={i} className="card p-5"><div className="skeleton h-48 rounded-xl"/></div>)}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><BarChart2 size={22}/> My Statistics</h1>
        <p className="page-subtitle">Overview of your inspection performance</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Inspections", value: stats?.total_inspections ?? 0, color: "bg-primary-600" },
          { label: "Total Findings",    value: stats?.total_findings    ?? 0, color: "bg-amber-500" },
          { label: "Completed",         value: stats?.inspections_by_status?.completed ?? 0, color: "bg-green-600" },
          { label: "In Draft",          value: stats?.inspections_by_status?.draft     ?? 0, color: "bg-slate-500" },
        ].map((s, i) => (
          <motion.div key={i} className="stat-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
              <span className="text-white font-bold text-lg">{s.value}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
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
                <Bar dataKey="count" fill="#2563eb" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400 text-center py-16">No findings recorded yet</p>}
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
      </div>
    </div>
  );
}
