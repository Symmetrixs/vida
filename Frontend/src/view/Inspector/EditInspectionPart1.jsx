import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

export default function EditInspectionPart1() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [buildings, setBuildings] = useState([]);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.get(`/inspections/${id}`), api.get("/buildings/")]).then(([insp, bldg]) => {
      const d = insp.data;
      setForm({ title: d.title, building_id: d.building_id, inspection_date: d.inspection_date?.slice(0,10) || "", weather_condition: d.weather_condition || "sunny", floor_level: d.floor_level || "", area_inspected: d.area_inspected || "", description: d.description || "" });
      setBuildings(bldg.data);
    }).catch(() => toast.error("Failed to load"));
  }, [id]);

  const set = (k, v) => setForm(f => ({...f, [k]: v}));

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.put(`/inspections/${id}`, form);
      toast.success("Inspection updated");
      navigate("/inspector/inspections");
    } catch { toast.error("Update failed"); }
    finally { setLoading(false); }
  };

  if (!form) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"/></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="page-header">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-600 mb-3 transition-colors"><ArrowLeft size={15}/> Back</button>
        <h1 className="page-title">Edit Inspection</h1>
      </div>

      <motion.form onSubmit={handleSave} className="card p-6 space-y-5" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div><label className="label">Inspection Title</label><input value={form.title} onChange={e => set("title", e.target.value)} className="input" required/></div>
        <div>
          <label className="label">Building</label>
          <select value={form.building_id} onChange={e => set("building_id", e.target.value)} className="input" required>
            <option value="">Select building…</option>
            {buildings.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Date</label><input type="date" value={form.inspection_date} onChange={e => set("inspection_date", e.target.value)} className="input"/></div>
          <div><label className="label">Weather</label>
            <select value={form.weather_condition} onChange={e => set("weather_condition", e.target.value)} className="input">
              {["sunny","cloudy","rainy","windy","overcast"].map(w => <option key={w} value={w}>{w.charAt(0).toUpperCase()+w.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Floor Level</label><input value={form.floor_level} onChange={e => set("floor_level", e.target.value)} className="input" placeholder="Ground Floor"/></div>
          <div><label className="label">Area Inspected</label><input value={form.area_inspected} onChange={e => set("area_inspected", e.target.value)} className="input" placeholder="Exterior"/></div>
        </div>
        <div><label className="label">Description</label><textarea value={form.description} onChange={e => set("description", e.target.value)} className="input resize-none" rows={3}/></div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
          <motion.button type="submit" disabled={loading} className="btn-primary" whileTap={{ scale: 0.97 }}>
            {loading ? "Saving…" : <span className="flex items-center gap-2"><Save size={15}/> Save Changes</span>}
          </motion.button>
        </div>
      </motion.form>
    </div>
  );
}
