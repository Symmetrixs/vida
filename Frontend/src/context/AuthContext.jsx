import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../api/axios.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme,   setTheme]   = useState(() => localStorage.getItem("vida-theme") || "light");

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("vida-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("vida-token");
    if (!token) { setLoading(false); return; }
    api.get("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => { localStorage.removeItem("vida-token"); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    const { access_token, user: userData } = res.data;
    localStorage.setItem("vida-token", access_token);
    setUser(userData);
    return userData;
  }, []);

  const register = useCallback(async (name, email, password, role = "inspector") => {
    const res = await api.post("/auth/register", { name, email, password, role });
    const { access_token, user: userData } = res.data;
    localStorage.setItem("vida-token", access_token);
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch (_) {}
    localStorage.removeItem("vida-token");
    setUser(null);
  }, []);

  const updateUser = useCallback((updates) => {
    setUser((prev) => ({ ...prev, ...updates }));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, theme, toggleTheme, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
