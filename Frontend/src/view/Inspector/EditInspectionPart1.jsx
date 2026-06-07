import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, ClipboardList, Camera } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import InspectionPhoto from "./InspectionPhoto.jsx";

const generateFloors = (count) => {
  if (!count || count < 1) return [];
  const list = ["Ground Floor"];
  for (let i = 1; i < count; i++) list.push(`Floor ${i}`);
  list.push("Rooftop");
  return list;
};

export default function EditInspectionPart1() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [buildings, setBuildings] = useState([]);
  const [form,      setForm]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("details");
  const [customFloor, setCustomFloor] = useState(false);

  const [locked, setLocked] = useState(false);

  useEffect(() => {
    Promise.all([api.get(`/inspections/${id}`), api.get("/buildings/")]).then(([insp, bldg]) => {
      const d = insp.data;
      if (d.created_at) {
        const age = (Date.now() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (age >= 3) setLocked(true);
      }
      setForm({
        title:             d.title             || "",
        building_id:       d.building_id       || "",
        inspection_date:   d.inspection_date?.slice(0,10) || "",
        weather_condition: d.weather_condition  || "sunny",
        floor_level:       d.floor_level        || "",
        area_inspected:    d.area_inspected     || "",
        description:       d.description        || "",
      });
      setBuildings(bldg.data);
    }).catch(() => toast.error("Failed to load"));
  }, [id]);

  const selectedBuilding = useMemo(
    () => buildings.find(b => b.id === form?.building_id),
    [buildings, form?.building_id]
  );

  const floorOptions = useMemo(
    () => generateFloors(selectedBuilding?.floors),
    [selectedBuilding]
  );

  const set = (k, v) => setForm(f => ({...f, [k]: v}));

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

  if (!form) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"/>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="page-header">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-600 mb-3 transition-colors">
          <ArrowLeft size={15}/> Back
        </button>
        <h1 className="page-title">Edit Inspection</h1>
      </div>

      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab("details")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "details"
              ? "bg-white dark:bg-slate-900 shadow text-slate-900 dark:text-white"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          }`}
        >
          <ClipboardList size={15}/> Details
        </button>
        <button
          onClick={() => setTab("photos")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "photos"
              ? "bg-white dark:bg-slate-900 shadow text-slate-900 dark:text-white"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          }`}
        >
          <Camera size={15}/> Photos
        </button>
      </div>

      {tab === "details" && locked && (
        <motion.div
          className="card p-6 flex flex-col items-center justify-center gap-3 py-12 text-center"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        >
          <span className="text-5xl">🔒</span>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Inspection Locked</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
            This inspection was created more than 3 days ago and can no longer be edited. Contact an administrator if changes are required.
          </p>
          <button onClick={() => navigate(-1)} className="btn-secondary mt-2">Go Back</button>
        </motion.div>
      )}

      {tab === "details" && !locked && (
        <motion.form
          onSubmit={handleSave}
          className="card p-6 space-y-5"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div>
            <label className="label">Inspection Title</label>
            <input value={form.title} onChange={e => set("title", e.target.value)} className="input" required/>
          </div>

          <div>
            <label className="label">Building</label>
            <select value={form.building_id} onChange={handleBuildingChange} className="input" required>
              <option value="">Select building…</option>
              {buildings.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code}) · {b.floors} floor{b.floors !== 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Date</label>
              <input type="date" value={form.inspection_date} onChange={e => set("inspection_date", e.target.value)} className="input"/>
            </div>
            <div>
              <label className="label">Weather</label>
              <select value={form.weather_condition} onChange={e => set("weather_condition", e.target.value)} className="input">
                {["sunny","cloudy","rainy","windy","overcast"].map(w => (
                  <option key={w} value={w}>{w.charAt(0).toUpperCase() + w.slice(1)}</option>
                ))}
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
                  placeholder="Select a building first or type…"
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
              <input value={form.area_inspected} onChange={e => set("area_inspected", e.target.value)} className="input" placeholder="Exterior"/>
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)} className="input resize-none" rows={3}/>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
            <motion.button type="submit" disabled={loading} className="btn-primary" whileTap={{ scale: 0.97 }}>
              {loading ? "Saving…" : <span className="flex items-center gap-2"><Save size={15}/> Save Changes</span>}
            </motion.button>
          </div>
        </motion.form>
      )}

      {tab === "photos" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <InspectionPhoto inspectionId={id} embedded />
          <div className="flex justify-end pt-2">
            <motion.button
              onClick={async () => {
                try {
                  await api.post(`/inspections/${id}/submit`);
                  toast.success("Inspection submitted!");
                  navigate("/inspector/inspections");
                } catch { toast.error("Submit failed"); }
              }}
              className="btn-primary flex items-center gap-2"
              whileTap={{ scale: 0.97 }}
            >
              <Save size={15}/> Save & Submit
            </motion.button>
          </div>
        </motion.div>
      )}
    </div>
  );
}