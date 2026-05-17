import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import "../tailwind.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              borderRadius: "12px",
              fontSize: "14px",
              fontFamily: "Inter, sans-serif",
            },
            success: {
              iconTheme: { primary: "#2563eb", secondary: "#fff" },
              style: { background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe" },
            },
            error: {
              style: { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" },
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
