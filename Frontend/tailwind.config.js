/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
        },
        vida: {
          blue:    "#1d4ed8",
          navy:    "#172554",
          sky:     "#38bdf8",
          light:   "#eff6ff",
          accent:  "#0ea5e9",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "fade-in":     "fadeIn 0.4s ease-in-out",
        "slide-up":    "slideUp 0.4s ease-out",
        "slide-down":  "slideDown 0.3s ease-out",
        "slide-in-right": "slideInRight 0.35s ease-out",
        "pulse-slow":  "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow":   "spin 2s linear infinite",
        "bounce-sm":   "bounceSm 0.6s ease-in-out",
        "skeleton":    "skeleton 1.5s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          "0%":   { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%":   { opacity: "0", transform: "translateX(30px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        bounceSm: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%":      { transform: "translateY(-6px)" },
        },
        skeleton: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(29,78,216,0.06)",
        "card-hover": "0 4px 24px rgba(29,78,216,0.14)",
        blue: "0 0 0 3px rgba(59,130,246,0.35)",
      },
      backgroundImage: {
        "skeleton-gradient":
          "linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)",
        "skeleton-gradient-dark":
          "linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)",
      },
    },
  },
  plugins: [],
};
