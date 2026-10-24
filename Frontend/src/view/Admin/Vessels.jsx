import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Plus, Search, Pencil, Trash2, X, DoorOpen, Check } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { apiErrorText } from "../../utils/apiError.js";
import { floorOptions } from "../../utils/floors.js";

function RoomsModal({ building, onClose }) {
  const floors = floorOptions(building.floors);
  const [floor, setFloor] = useState(floors[0]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/buildings/${building.id}/rooms`)
      .then(r => setRooms(r.data))
      .catch(e => toast.error(apiErrorText(e, "Failed to load rooms")))
      .finally(() => setLoading(false));
  }, [building.id]);

  const onFloor = rooms.filter(r => r.floor === floor);
  const countFor = (f) => rooms.filter(r => r.floor === f).length;

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const r = await api.post(`/buildings/${building.id}/rooms`, { floor, name });
      setRooms(prev => [...prev, r.data]);
      setName("");
    } catch (err) { toast.error(apiErrorText(err, "Failed to add room")); }
    finally { setBusy(false); }
  };

  const rename = async () => {
    if (!editing?.name.trim()) return;
    setBusy(true);
    try {
      const r = await api.put(`/buildings/rooms/${editing.id}`, { name: editing.name });
      setRooms(prev => prev.map(x => x.id === editing.id ? { ...x, name: r.data.name } : x));
      setEditing(null);
    } catch (err) { toast.error(apiErrorText(err, "Failed to rename room")); }
    finally { setBusy(false); }
  };

  const remove = async (room) => {
    if (!confirm(`Remove ${room.name} from ${room.floor}? Existing inspections and complaints keep their saved location text.`)) return;
    try {
      await api.delete(`/buildings/rooms/${room.id}`);
      setRooms(prev => prev.filter(x => x.id !== room.id));
    } catch (err) { toast.error(apiErrorText(err, "Failed to remove room")); }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="card w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] flex flex-col" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-slate-900 dark:text-white">Rooms in {building.name}</h3>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X size={16}/></button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">These names appear in the location dropdown on the public complaint form and on inspections. Anything not listed can still be typed under Other.</p>
        <div className="flex flex-col sm:flex-row gap-4 min-h-0 flex-1">
          <div className="sm:w-44 shrink-0 flex sm:flex-col gap-1 overflow-auto">
            {floors.map(f => (
              <button key={f} onClick={() => { setFloor(f); setEditing(null); }}
                className={`text-left px-3 py-2 rounded-lg text-sm whitespace-nowrap flex items-center justify-between gap-2 ${f === floor ? "bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                <span>{f}</span><span className="text-xs text-slate-400">{countFor(f)}</span>
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-0 flex flex-col">
            <form onSubmit={add} className="flex gap-2 mb-3">
              <input value={name} onChange={e => setName(e.target.value)} className="input flex-1" placeholder={`Add a room on ${floor}, e.g. BK15`} maxLength={100}/>
              <button type="submit" disabled={busy || !name.trim()} className="btn-primary px-3"><Plus size={15}/> Add</button>
            </form>
            <div className="overflow-auto flex-1 border border-slate-100 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-6 w-full rounded"/>)}</div>
              ) : onFloor.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">No rooms on {floor} yet</p>
              ) : onFloor.map(room => (
                <div key={room.id} className="flex items-center gap-2 px-3 py-2">
                  {editing?.id === room.id ? (
                    <>
                      <input value={editing.name} onChange={e => setEditing(x => ({ ...x, name: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") rename(); if (e.key === "Escape") setEditing(null); }} className="input flex-1 py-1.5" autoFocus maxLength={100}/>
                      <button onClick={rename} disabled={busy} className="btn-ghost p-1.5 rounded-lg text-emerald-600" title="Save"><Check size={14}/></button>
                      <button onClick={() => setEditing(null)} className="btn-ghost p-1.5 rounded-lg" title="Cancel"><X size={14}/></button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">{room.name}</span>
                      <button onClick={() => setEditing({ id: room.id, name: room.name })} className="btn-ghost p-1.5 rounded-lg" title="Rename"><Pencil size={13}/></button>
                      <button onClick={() => remove(room)} className="btn-ghost p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Remove"><Trash2 size={13}/></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function BuildingModal({ building, onClose, onSaved }) {
  const isEdit = !!building;
  const [form, setForm] = useState({ name: building?.name || "", code: building?.code || "", location: building?.location || "", description: building?.description || "", floors: building?.floors || 1, year_built: building?.year_built || "" });
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const payload = {
        ...form,
        floors: form.floors ? parseInt(form.floors) : 1,
        year_built: form.year_built ? parseInt(form.year_built) : null,
      };
      if (isEdit) await api.put(`/buildings/${building.id}`, payload);
      else await api.post("/buildings/", payload);
      toast.success(isEdit ? "Building updated" : "Building created");
      onSaved();
    } catch (e) { toast.error(apiErrorText(e, "Failed")); }
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
  const [roomsFor, setRoomsFor] = useState(null);

  const fetch = () => {
    setLoading(true);
    api.get("/buildings/").then(r => setBuildings(r.data)).catch(e => toast.error(apiErrorText(e, "Failed to load buildings"))).finally(() => setLoading(false));
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
        <div><h1 className="page-title flex items-center gap-2"><Building2 size={22}/> Buildings</h1><p className="page-subtitle">Manage campus buildings and the rooms on each floor</p></div>
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
                  <button onClick={() => setRoomsFor(b)} className="btn-ghost p-1.5 rounded-lg" title="Rooms"><DoorOpen size={13}/></button>
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
                <button onClick={() => setRoomsFor(b)} className="ml-auto text-xs font-medium text-primary-600 hover:underline">Manage rooms</button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {roomsFor && <RoomsModal building={roomsFor} onClose={() => setRoomsFor(null)}/>}
        {modal !== null && <BuildingModal building={Object.keys(modal).length ? modal : null} onClose={() => setModal(null)} onSaved={() => { setModal(null); fetch(); }}/>}
      </AnimatePresence>
    </div>
  );
}
