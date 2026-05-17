import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Building2, Search, MapPin, Layers, Calendar } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

export default function VesselManagement() {
  const [buildings, setBuildings] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/buildings/").then(r => setBuildings(r.data)).catch(() => toast.error("Failed")).finally(() => setLoading(false));
  }, []);

  const filtered = buildings.filter(b => b.name?.toLowerCase().includes(search.toLowerCase()) || b.code?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><Building2 size={22}/> Buildings</h1>
        <p className="page-subtitle">UTeM campus buildings available for inspection</p>
      </div>
      <div className="card p-4 flex items-center gap-3">
        <Search size={16} className="text-slate-400 shrink-0"/>
        <input value={search} onChange={e => setSearch(e.target.value)} className="flex-1 bg-transparent outline-none text-sm placeholder-slate-400 text-slate-700 dark:text-slate-300" placeholder="Search buildings…"/>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[...Array(4)].map((_,i)=><div key={i} className="card p-5 space-y-3"><div className="skeleton h-5 w-2/3 rounded"/><div className="skeleton h-4 w-full rounded"/></div>)}</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center"><Building2 size={40} className="text-slate-300 dark:text-slate-700 mx-auto mb-3"/><p className="text-slate-400">No buildings found</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((b, i) => (
            <motion.div key={b.id} className="card p-5" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                  <Building2 size={18} className="text-primary-600 dark:text-primary-400"/>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{b.name}</h3>
                  <span className="text-xs font-mono text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 px-2 py-0.5 rounded">{b.code}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><MapPin size={12}/>{b.location}</div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><Layers size={12}/>{b.floors} floor{b.floors > 1 ? "s" : ""}</div>
                {b.year_built && <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><Calendar size={12}/>Built {b.year_built}</div>}
              </div>
              {b.description && <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 line-clamp-2">{b.description}</p>}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
