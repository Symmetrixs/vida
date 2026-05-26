import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, Building2 } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

const generateFloors = (count) => {
  if (!count || count < 1) return [];
  const list = ["Ground Floor"];
  for (let i = 1; i < count; i++) list.push(`Floor ${i}`);
  list.push("Rooftop");
  return list;
};

export default function InspectionPart1() {
  const navigate = useNavigate();
  const [buildings, setBuildings] = useState([]);
  const [form, setForm] = useState({
    title: "",
    building_id: "",
    inspection_date: new Date().toISOString().slice(0,10),
    weather_condition: "sunny",
    floor_level: "",
    area_inspected: "",
    description: "",
  });
  const [customFloor, setCustomFloor] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get("/buildings/").then(r => setBuildings(r.data)).catch(() => {}); }, []);

  const selectedBuilding = useMemo(
    () => buildings.find(b => b.id === form.building_id),
    [buildings, form.building_id]
  );

  const floorOptions = useMemo(
    () => generateFloors(selectedBuilding?.floors),
    [selectedBuilding]
  );

  const handleBuildingChange = (e) => {
    setForm(f => ({ ...f, building_id: e.target.value, floor_level: "" }));
    setCustomFloor(false);
  };

  const handleFloorChange = (e) => {
    const v = e.target.value;
    if (v === "__custom__") {
      setCustomFloor(true);
      setForm(f => ({ ...f, floor_level: "" }));
    } else {
      setCustomFloor(false);
      setForm(f => ({ ...f, floor_level: v }));
    }
  };

  const handleNext = async (e) => {
    e.preventDefault();
    if (!form.building_id) { toast.error("Please select a building"); return; }
    setLoading(true);
    try {
      const r = await api.post("/inspections/", form);
      toast.success("Inspection created");
      navigate("/inspector/inspections/new/part2", { state: { inspectionId: r.data.id } });
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
    finally { setLoading(false); }
  };

  const set = (k, v) => setForm(f => ({...f, [k]: v}));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <span className="badge-blue">Step 1 of 3</span> General Information
        </div>
        <h1 className="page-title">New Inspection</h1>
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
          <select value={form.building_id} onChange={handleBuildingChange} className="input" required>
            <option value="">Select a building…</option>
            {buildings.map(b => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code}) · {b.floors} floor{b.floors !== 1 ? "s" : ""}
              </option>
            ))}
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
            <label className="label">Floor Level</label>
            {!selectedBuilding ? (
              <input
                value={form.floor_level}
                onChange={e => set("floor_level", e.target.value)}
                className="input"
                placeholder="Select a building first…"
                disabled
              />
            ) : customFloor ? (
              <div className="flex gap-2">
                <input
                  value={form.floor_level}
                  onChange={e => set("floor_level", e.target.value)}
                  className="input flex-1"
                  placeholder="Type custom floor…"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => { setCustomFloor(false); setForm(f => ({ ...f, floor_level: "" })); }}
                  className="btn-secondary px-2"
                  title="Use dropdown"
                >↩</button>
              </div>
            ) : (
              <select
                value={form.floor_level}
                onChange={handleFloorChange}
                className="input"
              >
                <option value="">Select a floor…</option>
                {floorOptions.map(f => <option key={f} value={f}>{f}</option>)}
                <option value="__custom__">Other (type custom)…</option>
              </select>
            )}
          </div>
          <div>
            <label className="label">Area Inspected</label>
            <input value={form.area_inspected} onChange={e => set("area_inspected", e.target.value)} className="input" placeholder="e.g. Exterior facade"/>
          </div>
        </div>

        <div>
          <label className="label">Description / Remarks</label>
          <textarea value={form.description} onChange={e => set("description", e.target.value)} className="input resize-none" rows={3} placeholder="Additional notes…"/>
        </div>

        <div className="flex justify-end pt-2">
          <motion.button type="submit" disabled={loading} className="btn-primary" whileTap={{ scale: 0.97 }}>
            {loading ? "Creating…" : <span className="flex items-center gap-2">Next: Photos <ChevronRight size={16}/></span>}
          </motion.button>
        </div>
      </motion.form>
    </div>
  );
}