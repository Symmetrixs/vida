import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, CheckCircle2, Copy, ImagePlus, RefreshCw, Send, X } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";
import { apiErrorText } from "../../utils/apiError.js";
import logo from "../../assets/company-logo.png";
import { floorOptions } from "../../utils/floors.js";

const MAX_PHOTOS = 3;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BLANK = { building_id: "", floor: "", location_note: "", description: "", reporter_name: "", reporter_email: "", reporter_phone: "", website: "" };

const locationOptions = (floors) => [...floorOptions(floors), "Outside the building"];

export default function ReportDefect() {
  const [buildings, setBuildings] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [photos, setPhotos] = useState([]);
  const [captcha, setCaptcha] = useState(null);
  const [answer, setAnswer] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const photosRef = useRef([]);
  const fileInput = useRef(null);

  const loadCaptcha = useCallback(() => {
    setAnswer("");
    api.get("/public/captcha").then(r => setCaptcha(r.data)).catch(() => setCaptcha(null));
  }, []);

  useEffect(() => {
    api.get("/public/buildings").then(r => setBuildings(r.data)).catch(e => toast.error(apiErrorText(e, "Could not load buildings")));
    loadCaptcha();
  }, [loadCaptcha]);

  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => () => photosRef.current.forEach(p => URL.revokeObjectURL(p.url)), []);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError(""); };
  const selBuilding = buildings.find(b => b.id === form.building_id);

  const addPhotos = (fileList) => {
    const incoming = Array.from(fileList || []);
    const room = MAX_PHOTOS - photos.length;
    if (incoming.length > room) toast.error(`You can attach up to ${MAX_PHOTOS} photos`);
    const accepted = [];
    for (const file of incoming.slice(0, Math.max(room, 0))) {
      if (!ALLOWED_TYPES.includes(file.type)) { toast.error(`${file.name}: only JPEG, PNG or WEBP images`); continue; }
      if (file.size > MAX_BYTES) { toast.error(`${file.name}: larger than 5 MB`); continue; }
      accepted.push({ file, url: URL.createObjectURL(file) });
    }
    if (accepted.length) setPhotos(p => [...p, ...accepted]);
    if (fileInput.current) fileInput.current.value = "";
  };

  const removePhoto = (idx) => {
    setPhotos(p => {
      URL.revokeObjectURL(p[idx].url);
      return p.filter((_, i) => i !== idx);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!photos.length) { setError("Attach at least one photo of the defect."); return; }
    if (form.description.trim().length < 10) { setError("Describe the defect in at least 10 characters."); return; }
    if (!captcha) { setError("Captcha did not load. Press refresh and try again."); return; }
    setLoading(true);
    setError("");
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    fd.append("captcha_token", captcha.token);
    fd.append("captcha_answer", answer);
    photos.forEach(p => fd.append("photos", p.file, p.file.name));
    try {
      const r = await api.post("/public/complaints", fd, { timeout: 60000 });
      setReference(r.data.reference);
    } catch (err) {
      setError(apiErrorText(err, "Could not send your report. Please try again."));
      loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    photos.forEach(p => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setForm(BLANK);
    setConsent(false);
    setReference("");
    loadCaptcha();
  };

  const copyReference = async () => {
    try { await navigator.clipboard.writeText(reference); toast.success("Reference copied"); }
    catch { toast.error("Copy failed"); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-950 via-primary-900 to-vida-navy flex items-center justify-center p-4 py-10">
      <motion.div className="w-full max-w-xl" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="text-center mb-6">
          <img src={logo} alt="VIDA Logo" className="w-16 h-16 rounded-2xl object-contain mx-auto mb-3 shadow-2xl" />
          <h1 className="text-2xl font-bold text-white">Report a defect</h1>
          <p className="text-primary-300 text-sm mt-1">No account needed. The facilities team reviews every report.</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 sm:p-8">
          {reference ? (
            <motion.div className="text-center py-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-100 dark:bg-green-900/30 mb-4">
                <CheckCircle2 size={32} className="text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Report received</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Keep this reference number if you need to follow up with the facilities office.</p>
              <div className="flex items-center justify-center gap-2 mb-6">
                <span className="font-mono text-xl font-bold tracking-wide text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 px-4 py-2 rounded-xl">{reference}</span>
                <button onClick={copyReference} className="btn-ghost p-2 rounded-lg" title="Copy reference"><Copy size={16} /></button>
              </div>
              <div className="flex flex-col gap-3">
                <button onClick={resetAll} className="btn-primary w-full justify-center">Report another defect</button>
                <Link to="/login" className="btn-secondary w-full justify-center">Back to sign in</Link>
              </div>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl text-sm">
                  <AlertCircle size={16} className="shrink-0" />{error}
                </motion.div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Building <span className="text-red-500">*</span></label>
                  <select value={form.building_id} onChange={e => { set("building_id", e.target.value); set("floor", ""); }} className="input" required>
                    <option value="">Select building...</option>
                    {buildings.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Floor <span className="text-red-500">*</span></label>
                  <select value={form.floor} onChange={e => set("floor", e.target.value)} className="input" required disabled={!form.building_id}>
                    <option value="">{form.building_id ? "Select floor..." : "Select building first"}</option>
                    {selBuilding && locationOptions(selBuilding.floors).map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Where exactly? <span className="text-red-500">*</span></label>
                <input value={form.location_note} onChange={e => set("location_note", e.target.value)} className="input" maxLength={200} placeholder="e.g. Corridor outside BK-12, near the stairs" required />
              </div>

              <div>
                <label className="label">What is wrong? <span className="text-red-500">*</span></label>
                <textarea value={form.description} onChange={e => set("description", e.target.value)} className="input resize-none" rows={4} maxLength={2000} placeholder="e.g. Large crack on the wall, water leaking from the ceiling" required />
                <p className="text-[11px] text-slate-400 mt-1 text-right">{form.description.length}/2000</p>
              </div>

              <div>
                <label className="label">Photos <span className="text-red-500">*</span> <span className="text-slate-400 font-normal">(1 to 3, JPEG/PNG/WEBP, max 5 MB each)</span></label>
                <div className="grid grid-cols-3 gap-3">
                  {photos.map((p, i) => (
                    <div key={p.url} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                      <img src={p.url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removePhoto(i)} className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1" title="Remove photo"><X size={12} /></button>
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <button type="button" onClick={() => fileInput.current?.click()}
                      className="aspect-square rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-primary-600 hover:border-primary-400 transition-colors">
                      <ImagePlus size={22} /><span className="text-xs">Add photo</span>
                    </button>
                  )}
                </div>
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => addPhotos(e.target.files)} />
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Contact details are optional. Leave them if you are happy to be contacted about this report.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input value={form.reporter_name} onChange={e => set("reporter_name", e.target.value)} className="input" maxLength={100} placeholder="Name" autoComplete="name" />
                  <input type="email" value={form.reporter_email} onChange={e => set("reporter_email", e.target.value)} className="input" maxLength={254} placeholder="Email" autoComplete="email" />
                  <input type="tel" value={form.reporter_phone} onChange={e => set("reporter_phone", e.target.value)} className="input" maxLength={20} placeholder="Phone" autoComplete="tel" />
                </div>
              </div>

              <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
                <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={e => set("website", e.target.value)} /></label>
              </div>

              <div>
                <label className="label">Quick check <span className="text-red-500">*</span></label>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg min-w-[96px] text-center">
                    {captcha ? `${captcha.question} =` : "..."}
                  </span>
                  <input value={answer} onChange={e => setAnswer(e.target.value.replace(/[^0-9]/g, ""))} className="input w-24" inputMode="numeric" maxLength={3} placeholder="?" required />
                  <button type="button" onClick={loadCaptcha} className="btn-ghost p-2 rounded-lg" title="New question"><RefreshCw size={15} /></button>
                </div>
              </div>

              <label className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5" required />
                I agree that VIDA stores this report, the photos and any contact details I give, and uses them only to handle this defect.
              </label>

              <motion.button type="submit" disabled={loading || !consent} className="btn-primary w-full py-2.5" whileTap={{ scale: 0.98 }}>
                {loading ? "Sending..." : <span className="flex items-center gap-2"><Send size={16} /> Send report</span>}
              </motion.button>

              <Link to="/login" className="flex items-center justify-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary-600">
                <ArrowLeft size={14} /> Back to sign in
              </Link>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-primary-400 mt-6">
          © {new Date().getFullYear()} UTeM – Faculty of ICT
        </p>
      </motion.div>
    </div>
  );
}
