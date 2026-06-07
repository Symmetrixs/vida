import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, Building2 } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

const SS_KEY = "vida_part1_draft";
const ssSave = v => { try { sessionStorage.setItem(SS_KEY, JSON.stringify(v)); } catch {} };
const ssLoad = def => { try { const s = sessionStorage.getItem(SS_KEY); return s ? JSON.parse(s) : def; } catch { return def; } };

const BLANK = { title: "", building_id: "", inspection_date: new Date().toISOString().slice(0,10), weather_condition: "sunny", floor_level: "", area_inspected: "", description: "" };

const floorOptions = (floors) => {
  const opts = ["Ground Floor"];
  for (let i = 1; i < (floors || 5); i++) opts.push(`Level ${i}`);
  opts.push("Rooftop");
  return opts;
};

export default function InspectionPart1() {
  const navigate  = useNavigate();
  const { state } = useLocation();

  const existingId = state?.inspectionId;

  const [buildings, setBuildings] = useState([]);
  const [form,      setForm]      = useState(() => existingId ? ssLoad(BLANK) : BLANK);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    if (!existingId) sessionStorage.removeItem(SS_KEY);
  }, [existingId]);

  const selBuilding = buildings.find(b => b.id === form.building_id);

  useEffect(() => {
    api.get("/buildings/").then(r => setBuildings(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!existingId) return;
    api.get(`/inspections/${existingId}`).then(r => {
      const d = r.data;
      const loaded = {
        title:             d.title             || "",
        building_id:       d.building_id       || "",
        inspection_date:   d.inspection_date   || new Date().toISOString().slice(0,10),
        weather_condition: d.weather_condition || "sunny",
        floor_level:       d.floor_level       || "",
        area_inspected:    d.area_inspected     || "",
        description:       d.description       || "",
      };
      setForm(loaded);
      ssSave(loaded);
    }).catch(() => {});
  }, [existingId]);

  const set = (k, v) => setForm(f => { const n = {...f, [k]: v}; ssSave(n); return n; });

  const handleNext = async (e) => {
    e.preventDefault();
    if (!form.title.trim())    { toast.error("Please enter an inspection title"); return; }
    if (!form.building_id)     { toast.error("Please select a building"); return; }
    if (!form.floor_level)     { toast.error("Please select a floor level"); return; }
    setLoading(true);
    try {
      let inspId = existingId;
      if (existingId) {
        await api.put(`/inspections/${existingId}`, form);
      } else {
        const r = await api.post("/inspections/", form);
        inspId   = r.data.id;
        toast.success("Inspection created");
      }
      navigate("/inspector/inspections/new/part2", { state: { inspectionId: inspId } });
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <span className="badge-blue">Step 1 of 3</span> General Information
        </div>
        <h1 className="page-title">{existingId ? "Edit Inspection Details" : "New Inspection"}</h1>
        <p className="page-subtitle">Fill in basic details about the inspection</p>
      </div>

      <div className="flex gap-2 mb-2">
        {["General Info","Findings","Review"].map((s,i) => (
          <div key={i} className={`flex-1 h-1.5 rounded-full ${i === 0 ? "bg-primary-600" : "bg-slate-200 dark:bg-slate-700"}`}/>
        ))}
      </div>

      <motion.form onSubmit={handleNext} className="card p-6 space-y-5" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div>
          <label className="label">Inspection Title *</label>
          <input value={form.title} onChange={e => set("title", e.target.value)} className="input" placeholder="e.g. FKM Block A – Annual Check" required/>
        </div>

        <div>
          <label className="label">Building *</label>
          <select value={form.building_id} onChange={e => { set("building_id", e.target.value); set("floor_level", ""); }} className="input" required>
            <option value="">Select a building…</option>
            {buildings.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Inspection Date</label>
            <input type="date" value={form.inspection_date} onChange={e => set("inspection_date", e.target.value)} className="input"/>
          </div>
          <div>
            <label className="label">Weather Condition</label>
            <select value={form.weather_condition} onChange={e => set("weather_condition", e.target.value)} className="input">
              {["sunny","cloudy","rainy","windy","overcast"].map(w => <option key={w} value={w}>{w.charAt(0).toUpperCase()+w.slice(1)}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Floor Level *</label>
            <select value={form.floor_level} onChange={e => set("floor_level", e.target.value)} className="input" required disabled={!form.building_id}>
              <option value="">{form.building_id ? "Select floor…" : "Select building first"}</option>
              {selBuilding && floorOptions(selBuilding.floors).map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Area Inspected</label>
            <input value={form.area_inspected} onChange={e => set("area_inspected", e.target.value)} className="input" placeholder="e.g. Exterior facade, Corridor"/>
          </div>
        </div>

        <div>
          <label className="label">Description / Remarks</label>
          <textarea value={form.description} onChange={e => set("description", e.target.value)} className="input resize-none" rows={3} placeholder="Additional notes…"/>
        </div>

        <div className="flex justify-end pt-2">
          <motion.button type="submit" disabled={loading} className="btn-primary" whileTap={{ scale: 0.97 }}>
            {loading ? (existingId ? "Updating…" : "Creating…") : <span className="flex items-center gap-2">Next: Photos <ChevronRight size={16}/></span>}
          </motion.button>
        </div>
      </motion.form>
    </div>
  );
}