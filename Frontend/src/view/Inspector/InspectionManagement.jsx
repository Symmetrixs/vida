import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ClipboardList, Plus, Search, Eye, Pencil, Trash2, Camera, Lock } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

const STATUS_COLOR = { draft: "badge-gray", submitted: "badge-blue", completed: "badge-green" };

const isLocked = (insp) => {
  if (insp.status === "draft") return false;
  const created = new Date(insp.created_at);
  const diff    = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
  return diff > 3;
};

export default function InspectionManagement() {
  const [inspections, setInspections] = useState([]);
  const [search,      setSearch]      = useState("");
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState("all");

  const fetchData = () => {
    setLoading(true);
    api.get("/inspections/").then(r => setInspections(r.data)).catch(() => toast.error("Failed to load")).finally(() => setLoading(false));
  };
  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id) => {
    if (!confirm("Delete this inspection?")) return;
    await api.delete(`/inspections/${id}`);
    toast.success("Deleted");
    fetchData();
  };

  const filtered = inspections.filter(i => {
    const matchSearch = i.title?.toLowerCase().includes(search.toLowerCase()) || i.buildings?.name?.toLowerCase().includes(search.toLowerCase());
    if (filter === "mine") return matchSearch && i.is_mine;
    return matchSearch;
  });

  return (
    <div className="space-y-6">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2"><ClipboardList size={22}/> Inspections</h1>
          <p className="page-subtitle">Manage your building inspections</p>
        </div>
        <Link to="/inspector/inspections/new/part1">
          <motion.button className="btn-primary" whileTap={{ scale: 0.97 }}><Plus size={16}/> New Inspection</motion.button>
        </Link>
      </div>

      <div className="flex gap-3">
        <div className="card p-3 flex items-center gap-3 flex-1">
          <Search size={16} className="text-slate-400 shrink-0"/>
          <input value={search} onChange={e => setSearch(e.target.value)} className="flex-1 bg-transparent outline-none text-sm placeholder-slate-400 text-slate-700 dark:text-slate-300" placeholder="Search by title, building or inspector…"/>
        </div>
        <div className="card p-1 flex gap-1">
          {["all","mine"].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${filter === f ? "bg-primary-600 text-white" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
              {f === "all" ? "All Inspections" : "My Inspections"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_,i) => <div key={i} className="card p-4 flex gap-4"><div className="skeleton h-12 w-12 rounded-xl"/><div className="flex-1 space-y-2"><div className="skeleton h-4 w-1/2 rounded"/><div className="skeleton h-3 w-1/3 rounded"/></div></div>)}</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <ClipboardList size={40} className="text-slate-300 dark:text-slate-700 mx-auto mb-3"/>
          <p className="text-slate-400 mb-4">No inspections found</p>
          <Link to="/inspector/inspections/new/part1" className="btn-primary inline-flex"><Plus size={15}/> Start one now</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((insp, i) => {
            const locked = isLocked(insp);
            return (
              <motion.div key={insp.id} className="card p-4 flex items-center gap-4" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                  <ClipboardList size={18} className="text-primary-600 dark:text-primary-400"/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{insp.title}</p>
                    {insp.is_mine && <span className="badge-blue text-[10px]">Mine</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {insp.buildings?.name || "No building"} · {new Date(insp.inspection_date || insp.created_at).toLocaleDateString("en-MY")} · <span className="capitalize">{insp.inspector?.name || "Me"}</span>
                  </p>
                  {locked && (
                    <p className="text-[10px] text-amber-500 flex items-center gap-1 mt-0.5">
                      <Lock size={10}/> Locked — inspections cannot be edited after 3 days
                    </p>
                  )}
                </div>
                <span className={STATUS_COLOR[insp.status] || "badge-gray"}>{insp.status}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <Link to={`/inspector/inspections/${insp.id}/photo`} className="btn-ghost p-1.5 rounded-lg" title="Photos"><Camera size={14}/></Link>
                  {locked ? (
                    <span className="btn-ghost p-1.5 rounded-lg opacity-40 cursor-not-allowed" title="Locked after 3 days"><Lock size={14}/></span>
                  ) : (
                    <Link to={`/inspector/inspections/${insp.id}/edit`} className="btn-ghost p-1.5 rounded-lg" title="Edit"><Pencil size={14}/></Link>
                  )}
                  <button onClick={() => handleDelete(insp.id)} className="btn-ghost p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete"><Trash2 size={14}/></button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}