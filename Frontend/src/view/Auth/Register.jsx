import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, UserPlus, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import api from "../../api/axios.js";
import { apiErrorText } from "../../utils/apiError.js";
import logo from "../../assets/company-logo.png";

const BLANK = { name: "", email: "", employee_id: "", password: "", confirm: "" };

export default function Register() {
  const [form, setForm] = useState(BLANK);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleChange = (e) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (form.password !== form.confirm) { setError("The two passwords do not match."); return; }
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/register", {
        name: form.name.trim(),
        email: form.email.trim(),
        employee_id: form.employee_id.trim(),
        password: form.password,
      });
      setDone(true);
    } catch (err) {
      setError(apiErrorText(err, "Registration failed. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-950 via-primary-900 to-vida-navy flex items-center justify-center p-4">
      <motion.div className="w-full max-w-md relative" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
        <div className="text-center mb-6">
          <img src={logo} alt="VIDA Logo" className="w-16 h-16 rounded-2xl object-contain mx-auto mb-3 shadow-2xl"/>
          <h1 className="text-2xl font-bold text-white tracking-tight">VIDA</h1>
          <p className="text-primary-300 text-sm mt-1">Visual Infrastructure Defect Analyzer</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8">
          {done ? (
            <div className="text-center space-y-3 py-4">
              <CheckCircle2 size={44} className="mx-auto text-emerald-500"/>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Registration received</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">An admin will review your account and assign your role. You can sign in once it has been approved.</p>
              <Link to="/login" className="btn-primary inline-flex mt-2"><ArrowLeft size={16}/> Back to sign in</Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Create an account</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">An admin approves every new account and assigns its role.</p>
              </div>

              {error && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl text-sm mb-5">
                  <AlertCircle size={16} className="shrink-0"/>
                  {error}
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Full name</label>
                  <input name="name" value={form.name} onChange={handleChange} className="input" maxLength={100} autoComplete="name" required/>
                </div>
                <div>
                  <label className="label">Email address</label>
                  <input name="email" type="email" value={form.email} onChange={handleChange} className="input" placeholder="you@utem.edu.my" autoComplete="email" required/>
                </div>
                <div>
                  <label className="label">Matric No. / Employee ID</label>
                  <input name="employee_id" value={form.employee_id} onChange={handleChange} className="input" maxLength={40} required/>
                </div>
                <div>
                  <label className="label">Password</label>
                  <div className="relative">
                    <input name="password" type={showPw ? "text" : "password"} value={form.password} onChange={handleChange} className="input pr-10" placeholder="At least 8 characters" autoComplete="new-password" required/>
                    <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                      {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label">Confirm password</label>
                  <input name="confirm" type={showPw ? "text" : "password"} value={form.confirm} onChange={handleChange} className="input" autoComplete="new-password" required/>
                </div>
                <motion.button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-2" whileTap={{ scale: 0.98 }}>
                  {loading ? "Submitting..." : <span className="flex items-center gap-2"><UserPlus size={16}/> Register</span>}
                </motion.button>
              </form>

              <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
                Already have an account? <Link to="/login" className="text-primary-600 hover:underline">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
