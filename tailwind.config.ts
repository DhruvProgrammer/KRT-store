import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        // Deep cool slate backgrounds
        bg: {
          DEFAULT: "#161a22",
          soft: "#11141b",
          raised: "#1a1f29"
        },
        // Steel charcoal card surfaces
        surface: {
          DEFAULT: "#1f2430",
          bright: "#262d3d",
          muted: "#2d3548",
          ink: "#1d222d"
        },
        // Cool ice white + blue-gray slates
        ink: {
          DEFAULT: "#f1f5f9",
          muted: "#94a3b8",
          soft: "#cbd5e1",
          inverse: "#0b0e14"
        },
        // Slate dividers
        line: {
          DEFAULT: "rgba(148, 163, 184, 0.14)",
          bright: "rgba(148, 163, 184, 0.22)",
          blue: "rgba(0, 162, 255, 0.28)"
        },
        // Pantone-inspired blue accents
        accent: {
          DEFAULT: "#00a2ff",
          bright: "#38bdf8",
          deep: "#0078ff",
          soft: "rgba(0, 162, 255, 0.12)"
        }
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "\"Segoe UI\"",
          "sans-serif"
        ],
        serif: ["Georgia", "Cambria", "\"Times New Roman\"", "serif"],
        mono: ["SFMono-Regular", "Consolas", "\"Liberation Mono\"", "monospace"]
      },
      boxShadow: {
        glow: "0 0 40px rgba(0, 162, 255, 0.18)",
        "glow-sm": "0 0 25px rgba(0, 162, 255, 0.18)",
        "glow-md": "0 0 32px rgba(0, 162, 255, 0.28)",
        "glow-lg": "0 0 48px rgba(0, 162, 255, 0.4)",
        soft: "0 16px 48px rgba(10, 12, 18, 0.4)",
        card: "0 8px 30px rgba(10, 12, 18, 0.3)"
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem"
      },
      backgroundImage: {
        aurora:
          "radial-gradient(circle at 20% 20%, rgba(0,162,255,0.08), transparent 32%), radial-gradient(circle at 80% 10%, rgba(148,163,184,0.05), transparent 30%), radial-gradient(circle at 50% 90%, rgba(0,162,255,0.05), transparent 34%)",
        mesh:
          "linear-gradient(135deg, rgba(0,162,255,0.06), transparent 35%), radial-gradient(circle at top right, rgba(148,163,184,0.05), transparent 35%)",
        "blue-fade":
          "linear-gradient(180deg, rgba(0, 162, 255, 0.18), transparent 70%)",
        "slate-card":
          "linear-gradient(145deg, rgba(31, 36, 48, 0.7), rgba(17, 20, 27, 0.55))"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-120% 0" },
          "100%": { backgroundPosition: "120% 0" }
        },
        glow: {
          "0%, 100%": { boxShadow: "0 0 18px rgba(0, 162, 255, 0.25)" },
          "50%": { boxShadow: "0 0 30px rgba(0, 162, 255, 0.5)" }
        }
      },
      animation: {
        float: "float 7s ease-in-out infinite",
        shimmer: "shimmer 2.4s linear infinite",
        glow: "glow 3.2s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
