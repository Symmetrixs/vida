import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, LogIn, AlertCircle, Clock, XCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import toast from "react-hot-toast";
import logo from "../../assets/company-logo.png";

const STATUS_SCREENS = {
  pending: {
    icon: Clock,
    iconClass: "text-amber-500",
    bgClass: "bg-amber-100 dark:bg-amber-900/30",
    title: "Account Pending Approval",
    message: "Your administrator account has not been approved yet. Please wait for an existing administrator to review your request.",
  },
  rejected: {
    icon: XCircle,
    iconClass: "text-red-500",
    bgClass: "bg-red-100 dark:bg-red-900/30",
    title: "Account Rejected",
    message: "Your administrator account request has been rejected. Please contact your system administrator for assistance.",
  },
};

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [form, setForm]       = useState({ email: "", password: "" });
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [statusScreen, setStatusScreen] = useState(null);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError("");
    setStatusScreen(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setStatusScreen(null);
    try {
      const user = await login(form.email, form.password);
      toast.success(`Welcome back, ${user.name}!`);
      navigate(user.role === "admin" ? "/admin" : "/inspector", { replace: true });
    } catch (err) {
      const detail = err.response?.data?.detail || "";
      if (detail === "Account pending approval") {
        setStatusScreen("pending");
      } else if (detail === "Account rejected") {
        setStatusScreen("rejected");
      } else {
        setError(detail || "Invalid email or password");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-950 via-primary-900 to-vida-navy flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-white/5"
            style={{
              width:  `${120 + i * 60}px`,
              height: `${120 + i * 60}px`,
              left:   `${10 + i * 15}%`,
              top:    `${5  + i * 12}%`,
            }}
            animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ repeat: Infinity, duration: 4 + i, delay: i * 0.6 }}
          />
        ))}
      </div>

      <motion.div
        className="w-full max-w-md relative"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="text-center mb-8">
          <motion.img
            src={logo}
            alt="VIDA Logo"
            className="w-20 h-20 rounded-2xl object-contain mx-auto mb-4 shadow-2xl"
            whileHover={{ scale: 1.05 }}
          />
          <h1 className="text-3xl font-bold text-white tracking-tight">VIDA</h1>
          <p className="text-primary-300 text-sm mt-1">Visual Infrastructure Defect Analyzer</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8">

          {statusScreen ? (
            <motion.div
              key={statusScreen}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-2"
            >
              {(() => {
                const s = STATUS_SCREENS[statusScreen];
                const Icon = s.icon;
                return (
                  <>
                    <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 ${s.bgClass}`}>
                      <Icon size={32} className={s.iconClass} />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{s.title}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">{s.message}</p>
                    <button
                      onClick={() => { setStatusScreen(null); setForm({ email: "", password: "" }); }}
                      className="btn-secondary w-full justify-center"
                    >
                      Try a different account
                    </button>
                  </>
                );
              })()}
            </motion.div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Sign in</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Enter your credentials to continue</p>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl text-sm mb-5"
                >
                  <AlertCircle size={16} className="shrink-0" />
                  {error}
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="label">Email address</label>
                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    className="input"
                    placeholder="you@utem.edu.my"
                    autoComplete="email"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="label mb-0">Password</label>
                    <Link to="/forgot-password" className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <input
                      name="password"
                      type={showPw ? "text" : "password"}
                      value={form.password}
                      onChange={handleChange}
                      className="input pr-10"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <motion.button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full py-2.5 mt-2"
                  whileTap={{ scale: 0.98 }}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                      </svg>
                      Signing in...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2"><LogIn size={16}/> Sign in</span>
                  )}
                </motion.button>
              </form>

              <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
                Don't have an account?{" "}
                <Link to="/register" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
                  Register
                </Link>
              </p>
            </>
          )}
        </div>

        <p className="text-center text-xs text-primary-400 mt-6">
          © {new Date().getFullYear()} UTeM – Faculty of ICT
        </p>
      </motion.div>
    </div>
  );
}