import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, UserPlus, AlertCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import toast from "react-hot-toast";
import logo from "../../assets/company-logo.png";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", role: "inspector" });
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) { setError("Passwords do not match"); return; }
    if (form.password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      const user = await register(form.name, form.email, form.password, form.role);
      toast.success("Account created successfully!");
      navigate(user.role === "admin" ? "/admin" : "/inspector", { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-950 via-primary-900 to-vida-navy flex items-center justify-center p-4">
      <motion.div className="w-full max-w-md" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="text-center mb-8">
          <motion.img
            src={logo}
            alt="VIDA Logo"
            className="w-20 h-20 rounded-2xl object-contain mx-auto mb-4 shadow-2xl"
            whileHover={{ scale: 1.05 }}
          />
          <h1 className="text-2xl font-bold text-white">VIDA</h1>
          <p className="text-primary-300 text-sm mt-1">Create your account</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Register</h2>

          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl text-sm mb-5">
              <AlertCircle size={16} className="shrink-0" />{error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Full name</label>
              <input name="name" value={form.name} onChange={handleChange} className="input" placeholder="Ahmad bin Ali" required />
            </div>
            <div>
              <label className="label">Email address</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} className="input" placeholder="you@utem.edu.my" required />
            </div>
            <div>
              <label className="label">Role</label>
              <select name="role" value={form.role} onChange={handleChange} className="input">
                <option value="inspector">Inspector</option>
                <option value="facility_manager">Facility Manager</option>
              </select>
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input name="password" type={showPw ? "text" : "password"} value={form.password} onChange={handleChange} className="input pr-10" placeholder="Min. 6 characters" required />
                <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">Confirm password</label>
              <div className="relative">
                <input name="confirm" type={showConfirm ? "text" : "password"} value={form.confirm} onChange={handleChange} className="input pr-10" placeholder="Re-enter password" required />
                <button type="button" onClick={() => setShowConfirm((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <motion.button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-2" whileTap={{ scale: 0.98 }}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                  Creating account...
                </span>
              ) : (
                <span className="flex items-center gap-2"><UserPlus size={16}/> Create account</span>
              )}
            </motion.button>
          </form>

          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}