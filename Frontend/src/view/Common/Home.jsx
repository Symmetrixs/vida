import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ClipboardList, ClipboardCheck, ShieldAlert, Inbox, Users, Building2, FileText, BarChart3, Wrench, Plus, ArrowRight, LayoutGrid, Hammer, Scale, Hand } from "lucide-react";
import api from "../../api/axios.js";
import { useAuth } from "../../context/auth.js";
import { OPEN_STATUSES } from "../../utils/complaintUi.js";

function RoleCard({ icon: Icon, title, color, delay, stats, actions, note }) {
  return (
    <motion.div className="card p-5 flex flex-col gap-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white"/>
        </div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
      </div>
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          {stats.map(s => (
            <div key={s.label} className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
              <p className={`text-xl font-bold ${s.alert ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>{s.value ?? "—"}</p>
              <p className="text-xs text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
      )}
      {note && <p className="text-sm text-slate-500 dark:text-slate-400">{note}</p>}
      {actions && (
        <div className="mt-auto flex flex-wrap gap-2">
          {actions.map(({ to, label, icon: ActionIcon, primary }) => (
            <Link key={to} to={to} className={`${primary ? "btn-primary" : "btn-secondary"} text-xs inline-flex items-center gap-1.5`}>
              {ActionIcon ? <ActionIcon size={13}/> : null}{label}{!ActionIcon && <ArrowRight size={13}/>}
            </Link>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function InspectorCard({ delay }) {
  const [inspections, setInspections] = useState(null);
  const [tasks, setTasks] = useState(null);

  useEffect(() => {
    api.get("/inspections/").then(r => setInspections(r.data)).catch(() => setInspections([]));
    api.get("/inspector/assigned-tasks").then(r => setTasks(r.data)).catch(() => setTasks([]));
  }, []);

  const count = (status) => inspections?.filter(i => i.status === status).length;
  const open = tasks?.filter(t => OPEN_STATUSES.includes(t.status));
  const overdue = open?.filter(t => t.is_overdue).length;

  return (
    <RoleCard
      icon={ClipboardList} title="Inspector" color="bg-primary-600" delay={delay}
      stats={[
        { label: "Draft inspections", value: count("draft") },
        { label: "Submitted", value: count("submitted") },
        { label: "Assigned to me", value: open?.length },
        { label: "Overdue", value: overdue, alert: overdue > 0 },
      ]}
      actions={[
        { to: "/inspections/new/part1", label: "New Inspection", icon: Plus, primary: true },
        { to: "/inspections", label: "My Inspections" },
        { to: "/assigned", label: "Assigned" },
      ]}
    />
  );
}

function FacilityManagerCard({ delay }) {
  const [complaints, setComplaints] = useState(null);
  const [queue, setQueue] = useState(null);
  const [candidates, setCandidates] = useState(null);
  const [jobs, setJobs] = useState(null);

  useEffect(() => {
    api.get("/complaints/").then(r => setComplaints(r.data)).catch(() => setComplaints([]));
    api.get("/inspections/review-queue").then(r => setQueue(r.data)).catch(() => setQueue([]));
    api.get("/repairs/candidates").then(r => setCandidates(r.data)).catch(() => setCandidates([]));
    api.get("/repairs/").then(r => setJobs(r.data)).catch(() => setJobs([]));
  }, []);

  const overdueJobs = jobs?.filter(j => j.is_overdue).length;

  return (
    <RoleCard
      icon={Inbox} title="Facility Manager" color="bg-vida-accent" delay={delay}
      stats={[
        { label: "New complaints", value: complaints?.filter(c => c.status === "pending").length },
        { label: "Severity to set", value: queue?.filter(q => !q.reviewed).length },
        { label: "Ready for repair", value: candidates?.length },
        { label: "Repairs to review", value: jobs?.filter(j => j.status === "awaiting_review").length },
        { label: "Repairs in progress", value: jobs?.filter(j => j.status === "in_progress").length },
        { label: "Overdue repairs", value: overdueJobs, alert: overdueJobs > 0 },
      ]}
      actions={[
        { to: "/complaints", label: "Complaints", icon: Inbox, primary: true },
        { to: "/severity-review", label: "Severity Review", icon: ShieldAlert },
        { to: "/repair-assignment", label: "Repair Assignment", icon: Hammer },
        { to: "/repair-review", label: "Repair Review", icon: Scale },
      ]}
    />
  );
}

function AdminCard({ delay }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/admin/stats").then(r => setStats(r.data)).catch(() => setStats({}));
  }, []);

  return (
    <RoleCard
      icon={BarChart3} title="Admin" color="bg-violet-600" delay={delay}
      stats={[
        { label: "Staff accounts", value: stats?.total_users },
        { label: "Buildings", value: stats?.total_buildings },
        { label: "Inspections", value: stats?.total_inspections },
        { label: "Reports", value: stats?.total_reports },
      ]}
      actions={[
        { to: "/statistics", label: "Statistics", icon: BarChart3, primary: true },
        { to: "/staff", label: "Staff Accounts", icon: Users },
        { to: "/buildings", label: "Buildings", icon: Building2 },
        { to: "/all-reports", label: "All Reports", icon: FileText },
      ]}
    />
  );
}

function MaintenanceCard({ delay }) {
  const [board, setBoard] = useState(null);
  const [assigned, setAssigned] = useState(null);
  const [claimed, setClaimed] = useState(null);

  useEffect(() => {
    api.get("/repairs/board").then(r => setBoard(r.data)).catch(() => setBoard([]));
    api.get("/repairs/mine?type=assigned").then(r => setAssigned(r.data)).catch(() => setAssigned([]));
    api.get("/repairs/mine?type=claimed").then(r => setClaimed(r.data)).catch(() => setClaimed([]));
  }, []);

  const working = (list) => list?.filter(j => j.status === "in_progress");
  const mine = assigned && claimed ? [...assigned, ...claimed] : null;
  const overdue = mine?.filter(j => j.is_overdue).length;

  return (
    <RoleCard
      icon={Wrench} title="Maintenance" color="bg-amber-500" delay={delay}
      stats={[
        { label: "Open on Job Board", value: board?.length },
        { label: "Assigned to me", value: working(assigned)?.length },
        { label: "Claimed by me", value: working(claimed)?.length },
        { label: "Overdue", value: overdue, alert: overdue > 0 },
      ]}
      actions={[
        { to: "/jobs/board", label: "Job Board", icon: LayoutGrid, primary: true },
        { to: "/jobs/assigned", label: "Assigned Jobs", icon: ClipboardCheck },
        { to: "/jobs/claimed", label: "My Claimed Jobs", icon: Hand },
      ]}
    />
  );
}

export default function Home() {
  const { user, hasRole } = useAuth();
  const cards = [
    hasRole("inspector") && InspectorCard,
    hasRole("facility_manager") && FacilityManagerCard,
    hasRole("admin") && AdminCard,
    hasRole("maintenance") && MaintenanceCard,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Hello, {user?.name?.split(" ")[0]}</h1>
        <p className="page-subtitle">Here is what needs your attention across UTeM campus</p>
      </div>

      {cards.length === 0 ? (
        <div className="card p-12 text-center">
          <ClipboardCheck size={40} className="text-slate-300 dark:text-slate-700 mx-auto mb-3"/>
          <p className="text-slate-400">No roles are assigned to your account yet. Contact your administrator.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {cards.map((Card, i) => <Card key={i} delay={i * 0.06}/>)}
        </div>
      )}
    </div>
  );
}
