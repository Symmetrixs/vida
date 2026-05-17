import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { BarChart3, PieChart as PieIcon } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area } from "recharts";
import api from "../../api/axios.js";

const COLORS = ["#2563eb", "#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"];

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/admin/analytics").then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-6">
      <div className="page-header"><h1 className="page-title">Analytics</h1></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(4)].map((_, i) => <div key={i} className="card p-5"><div className="skeleton h-48 rounded-xl"/></div>)}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><BarChart3 size={22}/> Analytics</h1>
        <p className="page-subtitle">Visual overview of defect detection and inspection trends</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">Monthly Inspections</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data?.monthly_inspections || []}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
              <XAxis dataKey="month" tick={{ fontSize: 11 }}/>
              <YAxis tick={{ fontSize: 11 }}/>
              <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "13px" }}/>
              <Area type="monotone" dataKey="count" stroke="#2563eb" fill="url(#areaGrad)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">Defects by Type</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.defect_by_type || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
              <XAxis dataKey="type" tick={{ fontSize: 11 }}/>
              <YAxis tick={{ fontSize: 11 }}/>
              <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "13px" }}/>
              <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]}/>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">Severity Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data?.defect_by_severity || []} dataKey="count" nameKey="severity" cx="50%" cy="50%" outerRadius={80} label={({ severity, percent }) => `${severity} ${(percent * 100).toFixed(0)}%`}>
                {(data?.defect_by_severity || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "13px" }}/>
              <Legend wrapperStyle={{ fontSize: "12px" }}/>
            </PieChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">Summary</h3>
          <div className="space-y-3 mt-2">
            {(data?.defect_by_type || []).map((d, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }}/>
                <span className="text-sm text-slate-600 dark:text-slate-400 flex-1 capitalize">{d.type?.replace("_", " ")}</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{d.count}</span>
              </div>
            ))}
            {!data?.defect_by_type?.length && <p className="text-sm text-slate-400 text-center py-8">No data yet</p>}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
