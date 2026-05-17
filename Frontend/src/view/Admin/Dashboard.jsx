import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { BarChart3, Users, Building2, FileText, AlertTriangle, TrendingUp, Clock, CheckCircle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import api from "../../api/axios.js";
import { useAuth } from "../../context/AuthContext.jsx";

const StatCard = ({ icon: Icon, label, value, color, delay = 0 }) => (
  <motion.div className="stat-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4 }}>
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
      <Icon size={22} className="text-white" />
    </div>
    <div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value ?? "—"}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
    </div>
  </motion.div>
);

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/admin/stats"),
      api.get("/admin/analytics"),
      api.get("/admin/activity"),
    ]).then(([s, a, act]) => {
      setStats(s.data);
      setAnalytics(a.data);
      setActivity(act.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const statusColor = (s) => ({ draft: "badge-gray", submitted: "badge-blue", completed: "badge-green" }[s] || "badge-gray");

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Welcome back, {user?.name?.split(" ")[0]} 👋</h1>
        <p className="page-subtitle">Here's what's happening across UTeM campus today.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users}      label="Total Users"       value={stats?.total_users}       color="bg-primary-600"    delay={0}    />
        <StatCard icon={Building2}  label="Buildings"         value={stats?.total_buildings}   color="bg-vida-accent"    delay={0.05} />
        <StatCard icon={BarChart3}  label="Inspections"       value={stats?.total_inspections} color="bg-violet-600"     delay={0.1}  />
        <StatCard icon={AlertTriangle} label="Findings"       value={stats?.total_findings}    color="bg-amber-500"      delay={0.15} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-primary-600"/> Monthly Inspections</h3>
          {analytics?.monthly_inspections?.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={analytics.monthly_inspections}>
                <defs>
                  <linearGradient id="colCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "13px" }} />
                <Area type="monotone" dataKey="count" stroke="#2563eb" fill="url(#colCount)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400 text-center py-10">No data yet</p>}
        </motion.div>

        <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500"/> Defects by Type</h3>
          {analytics?.defect_by_type?.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={analytics.defect_by_type}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "13px" }} />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400 text-center py-10">No data yet</p>}
        </motion.div>
      </div>

      <motion.div className="card p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2"><Clock size={16} className="text-primary-600"/> Recent Activity</h3>
        {activity.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No recent activity</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {activity.map((a) => (
              <div key={a.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    <FileText size={14} className="text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{a.title}</p>
                    <p className="text-xs text-slate-400">{new Date(a.created_at).toLocaleDateString("en-MY")}</p>
                  </div>
                </div>
                <span className={statusColor(a.status)}>{a.status}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
