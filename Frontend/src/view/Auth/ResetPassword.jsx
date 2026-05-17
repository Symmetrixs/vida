import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Lock, CheckCircle } from "lucide-react";
import api from "../../api/axios.js";
import toast from "react-hot-toast";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) { setError("Passwords do not match"); return; }
    if (form.password.length < 6) { setError("Minimum 6 characters"); return; }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: form.password });
      setDone(true);
      toast.success("Password reset!");
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid or expired link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-950 via-primary-900 to-vida-navy flex items-center justify-center p-4">
      <motion.div className="w-full max-w-md" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8">
          {done ? (
            <div className="text-center py-4">
              <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Password updated!</h2>
              <p className="text-sm text-slate-500">Redirecting to sign in...</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 mb-5">
                <Lock size={22} className="text-primary-600 dark:text-primary-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Set new password</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Enter a strong new password for your account.</p>
              {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-xl mb-4">{error}</p>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">New password</label>
                  <div className="relative">
                    <input name="password" type={showPw ? "text" : "password"} value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} className="input pr-10" placeholder="Min. 6 characters" required />
                    <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label">Confirm password</label>
                  <input name="confirm" type="password" value={form.confirm} onChange={(e) => setForm(f => ({ ...f, confirm: e.target.value }))} className="input" placeholder="Re-enter password" required />
                </div>
                <motion.button type="submit" disabled={loading} className="btn-primary w-full py-2.5" whileTap={{ scale: 0.98 }}>
                  {loading ? "Resetting..." : "Reset password"}
                </motion.button>
              </form>
              <p className="text-center text-sm text-slate-500 mt-5">
                <Link to="/login" className="text-primary-600 hover:underline">Back to sign in</Link>
              </p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
