/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#2563EB", foreground: "#FFFFFF" },
        secondary: { DEFAULT: "#3B82F6", foreground: "#FFFFFF" },
        accent: { DEFAULT: "#DC2626", foreground: "#FFFFFF" },
        destructive: { DEFAULT: "#DC2626", foreground: "#FFFFFF" },
        background: "#FFFFFF",
        foreground: "#0F172A",
        muted: { DEFAULT: "#F1F5FD", foreground: "#64748B" },
        border: "#E4ECFC",
        ring: "#2563EB",
      },
      fontFamily: {
        sans: [
          "Plus Jakarta Sans",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
      transitionDuration: {
        DEFAULT: "180ms",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96) translateY(4px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "scale-in": "scale-in 180ms ease-out",
      },
    },
  },
  plugins: [],
};
