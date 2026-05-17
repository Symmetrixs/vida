import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Plus, Search, Pencil, Trash2, X } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

function BuildingModal({ building, onClose, onSaved }) {
  const isEdit = !!building;
  const [form, setForm] = useState({ name: building?.name || "", code: building?.code || "", location: building?.location || "", description: building?.description || "", floors: building?.floors || 1, year_built: building?.year_built || "" });
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      if (isEdit) await api.put(`/buildings/${building.id}`, form);
      else await api.post("/buildings/", form);
      toast.success(isEdit ? "Building updated" : "Building created");
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setLoading(false); }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="card w-full max-w-lg p-6 shadow-2xl" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-slate-900 dark:text-white">{isEdit ? "Edit Building" : "Add Building"}</h3>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X size={16}/></button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Building Name</label><input value={form.name} onChange={(e) => setForm(f => ({...f, name: e.target.value}))} className="input" placeholder="e.g. FKM Block A"/></div>
            <div><label className="label">Code</label><input value={form.code} onChange={(e) => setForm(f => ({...f, code: e.target.value}))} className="input" placeholder="e.g. FKM-A"/></div>
          </div>
          <div><label className="label">Location</label><input value={form.location} onChange={(e) => setForm(f => ({...f, location: e.target.value}))} className="input" placeholder="e.g. UTeM Main Campus, Durian Tunggal"/></div>
          <div><label className="label">Description</label><textarea value={form.description} onChange={(e) => setForm(f => ({...f, description: e.target.value}))} className="input resize-none" rows={2} placeholder="Optional description"/></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Floors</label><input type="number" min={1} value={form.floors} onChange={(e) => setForm(f => ({...f, floors: parseInt(e.target.value)}))} className="input"/></div>
            <div><label className="label">Year Built</label><input type="number" value={form.year_built} onChange={(e) => setForm(f => ({...f, year_built: e.target.value}))} className="input" placeholder="e.g. 2010"/></div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={loading} className="btn-primary flex-1">{loading ? "Saving..." : isEdit ? "Update" : "Create"}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Vessels() {
  const [buildings, setBuildings] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const fetch = () => {
    setLoading(true);
    api.get("/buildings/").then(r => setBuildings(r.data)).catch(() => toast.error("Failed to load buildings")).finally(() => setLoading(false));
  };
  useEffect(() => { fetch(); }, []);

  const handleDelete = async (id) => {
    if (!confirm("Delete this building and all associated data?")) return;
    await api.delete(`/buildings/${id}`);
    toast.success("Building deleted");
    fetch();
  };

  const filtered = buildings.filter(b => b.name?.toLowerCase().includes(search.toLowerCase()) || b.code?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="page-header flex items-center justify-between">
        <div><h1 className="page-title flex items-center gap-2"><Building2 size={22}/> Buildings</h1><p className="page-subtitle">Manage campus buildings</p></div>
        <motion.button onClick={() => setModal({})} className="btn-primary" whileTap={{ scale: 0.97 }}><Plus size={16}/> Add Building</motion.button>
      </div>

      <div className="card p-4 flex items-center gap-3">
        <Search size={16} className="text-slate-400 shrink-0"/>
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 bg-transparent outline-none text-sm placeholder-slate-400 text-slate-700 dark:text-slate-300" placeholder="Search buildings…"/>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="card p-5 space-y-3"><div className="skeleton h-5 w-2/3 rounded"/><div className="skeleton h-4 w-full rounded"/><div className="skeleton h-4 w-1/2 rounded"/></div>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center"><Building2 size={40} className="text-slate-300 dark:text-slate-700 mx-auto mb-3"/><p className="text-slate-400">No buildings found</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((b, i) => (
            <motion.div key={b.id} className="card p-5 hover:shadow-card-hover transition-shadow" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <Building2 size={18} className="text-primary-600 dark:text-primary-400"/>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setModal(b)} className="btn-ghost p-1.5 rounded-lg"><Pencil size={13}/></button>
                  <button onClick={() => handleDelete(b.id)} className="btn-ghost p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={13}/></button>
                </div>
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{b.name}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{b.code} · {b.location}</p>
              {b.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">{b.description}</p>}
              <div className="flex gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-400">{b.floors} floor{b.floors > 1 ? "s" : ""}</span>
                {b.year_built && <span className="text-xs text-slate-400">Built {b.year_built}</span>}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {modal !== null && <BuildingModal building={Object.keys(modal).length ? modal : null} onClose={() => setModal(null)} onSaved={() => { setModal(null); fetch(); }}/>}
      </AnimatePresence>
    </div>
  );
}
