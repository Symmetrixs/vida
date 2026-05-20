import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ClipboardList, Plus, Search, Eye, Pencil, Trash2, Camera, User } from "lucide-react";
import api from "../../api/axios.js";
import { useAuth } from "../../context/AuthContext.jsx";
import toast from "react-hot-toast";

const STATUS_COLOR = { draft: "badge-gray", submitted: "badge-blue", completed: "badge-green" };

export default function InspectionManagement() {
  const { user } = useAuth();
  const [inspections, setInspections] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const isPrivileged = user?.role === "admin" || user?.role === "facility_manager";

  const fetch = () => {
    setLoading(true);
    api.get("/inspections/").then(r => setInspections(r.data)).catch(() => toast.error("Failed to load")).finally(() => setLoading(false));
  };
  useEffect(() => { fetch(); }, []);

  const handleDelete = async (id) => {
    if (!confirm("Delete this inspection?")) return;
    await api.delete(`/inspections/${id}`);
    toast.success("Deleted");
    fetch();
  };

  const isOwner = (insp) => insp.inspector_id === user?.id;
  const canEdit = (insp) => user?.role === "admin" || isOwner(insp);

  const filtered = inspections
    .filter(i => filter === "mine" ? isOwner(i) : true)
    .filter(i =>
      i.title?.toLowerCase().includes(search.toLowerCase()) ||
      i.buildings?.name?.toLowerCase().includes(search.toLowerCase()) ||
      i.users?.name?.toLowerCase().includes(search.toLowerCase())
    );

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

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="card p-4 flex items-center gap-3 flex-1">
          <Search size={16} className="text-slate-400 shrink-0"/>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm placeholder-slate-400 text-slate-700 dark:text-slate-300"
            placeholder="Search by title, building or inspector…"
          />
        </div>

        <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
            {["all", "mine"].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  filter === f
                    ? "bg-primary-600 text-white"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                {f === "all" ? "All Inspections" : "My Inspections"}
              </button>
            ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_,i) => (
            <div key={i} className="card p-4 flex gap-4">
              <div className="skeleton h-12 w-12 rounded-xl"/>
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-1/2 rounded"/>
                <div className="skeleton h-3 w-1/3 rounded"/>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <ClipboardList size={40} className="text-slate-300 dark:text-slate-700 mx-auto mb-3"/>
          <p className="text-slate-400 mb-4">
            {filter === "mine" ? "You haven't created any inspections yet" : "No inspections found"}
          </p>
          <Link to="/inspector/inspections/new/part1" className="btn-primary inline-flex">
            <Plus size={15}/> Start one now
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((insp, i) => (
            <motion.div
              key={insp.id}
              className="card p-4 flex items-center gap-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                <ClipboardList size={18} className="text-primary-600 dark:text-primary-400"/>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{insp.title}</p>
                  {isOwner(insp) && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 shrink-0">
                      Mine
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <p className="text-xs text-slate-400">
                    {insp.buildings?.name || "No building"} · {new Date(insp.created_at).toLocaleDateString("en-MY")}
                  </p>
                  {insp.users?.name && (
                    <>
                      <span className="text-slate-300 dark:text-slate-600 text-xs">·</span>
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <User size={11}/> {insp.users.name}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <span className={STATUS_COLOR[insp.status] || "badge-gray"}>{insp.status}</span>

              <div className="flex items-center gap-1 shrink-0">
                {canEdit(insp) && (
                  <Link to={`/inspector/inspections/${insp.id}/photo`} className="btn-ghost p-1.5 rounded-lg" title="Photos">
                    <Camera size={14}/>
                  </Link>
                )}
                {canEdit(insp) ? (
                  <>
                    <Link to={`/inspector/inspections/${insp.id}/edit`} className="btn-ghost p-1.5 rounded-lg" title="Edit">
                      <Pencil size={14}/>
                    </Link>
                    <button
                      onClick={() => handleDelete(insp.id)}
                      className="btn-ghost p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="Delete"
                    >
                      <Trash2 size={14}/>
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-slate-300 dark:text-slate-600 px-2 italic">view only</span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}