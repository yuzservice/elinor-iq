/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
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
      },
      fontFamily: {
        sans: ["Vazirmatn", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "var(--shadow)",
      },
      letterSpacing: {
        brand: "0.28em",
      },
    },
  },
  plugins: [],
};
