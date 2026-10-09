/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: "var(--bg)",
        surface: "var(--surface)",
        elevated: "var(--elevated)",
        ink: "var(--text)",
        muted: "var(--text-secondary)",
        faint: "var(--text-faint)",
        line: "var(--border)",
        accent: "var(--accent)",
        "on-accent": "var(--on-accent)",
        sage: "var(--success)",
        warning: "var(--warning)",
        rose: "var(--danger)",
        hover: "var(--hover)",
        stripe: "var(--stripe)",
        obsidian: "#06080d",
        cyber: {
          blue: "#3b82f6",
          cyan: "#06b6d4",
          emerald: "#10b981",
          violet: "#8b5cf6",
          gold: "#f59e0b",
          rose: "#f43f5e",
        },
      },
      fontFamily: {
        sans: ["Vazirmatn", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "var(--shadow)",
        "glow-blue": "0 0 30px -5px rgba(59, 130, 246, 0.35)",
        "glow-emerald": "0 0 30px -5px rgba(16, 185, 129, 0.35)",
        "glow-violet": "0 0 30px -5px rgba(139, 92, 246, 0.3)",
        "card-light": "0 10px 30px -5px rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(15, 23, 42, 0.05)",
        "card-dark": "0 20px 40px -15px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)",
      },
      letterSpacing: {
        brand: "0.28em",
      },
    },
  },
  plugins: [],
};
