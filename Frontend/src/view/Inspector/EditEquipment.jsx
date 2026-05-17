import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Package } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

export default function EditEquipment() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const [form, setForm] = useState({ name: "", code: "", building_id: "", category: "", condition: "good", last_maintenance: "", notes: "" });
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/buildings/").then(r => setBuildings(r.data)).catch(() => {});
    if (isEdit) api.get(`/equipment/${id}`).then(r => setForm(r.data)).catch(() => {});
  }, [id]);

  const set = (k, v) => setForm(f => ({...f, [k]: v}));

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit) await api.put(`/equipment/${id}`, form);
      else await api.post("/equipment/", form);
      toast.success(isEdit ? "Equipment updated" : "Equipment added");
      navigate(-1);
    } catch { toast.error("Save failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="page-header">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-600 mb-3 transition-colors"><ArrowLeft size={15}/> Back</button>
        <h1 className="page-title flex items-center gap-2"><Package size={22}/> {isEdit ? "Edit Equipment" : "Add Equipment"}</h1>
      </div>
      <motion.form onSubmit={handleSave} className="card p-6 space-y-5" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Equipment Name</label><input value={form.name} onChange={e => set("name", e.target.value)} className="input" required/></div>
          <div><label className="label">Code / ID</label><input value={form.code} onChange={e => set("code", e.target.value)} className="input"/></div>
        </div>
        <div><label className="label">Building</label>
          <select value={form.building_id} onChange={e => set("building_id", e.target.value)} className="input">
            <option value="">Select building…</option>
            {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Category</label><input value={form.category} onChange={e => set("category", e.target.value)} className="input" placeholder="e.g. HVAC, Electrical"/></div>
          <div><label className="label">Condition</label>
            <select value={form.condition} onChange={e => set("condition", e.target.value)} className="input">
              {["excellent","good","fair","poor","critical"].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label">Last Maintenance Date</label><input type="date" value={form.last_maintenance} onChange={e => set("last_maintenance", e.target.value)} className="input"/></div>
        <div><label className="label">Notes</label><textarea value={form.notes} onChange={e => set("notes", e.target.value)} className="input resize-none" rows={3}/></div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
          <motion.button type="submit" disabled={loading} className="btn-primary" whileTap={{ scale: 0.97 }}>
            {loading ? "Saving…" : <span className="flex items-center gap-2"><Save size={15}/> {isEdit ? "Update" : "Add Equipment"}</span>}
          </motion.button>
        </div>
      </motion.form>
    </div>
  );
}
