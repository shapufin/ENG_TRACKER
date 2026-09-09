/** @type {import('tailwindcss').Config} */
import defaultTheme from "tailwindcss/defaultTheme";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        "card-raised": "hsl(var(--card-raised))",
        "surface-sunken": "hsl(var(--surface-sunken))",
        "line-subtle": "hsl(var(--line-subtle))",
        "input-bg": "hsl(var(--input-bg))",
        "border-focus": "hsl(var(--border-focus))",
        focus: "hsl(var(--focus))",
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
        "icon-vacation": "hsl(var(--icon-vacation))",
        "icon-sick": "hsl(var(--icon-sick))",
        "icon-balance": "hsl(var(--icon-balance))",
        "accent-red": "hsl(var(--accent-red))",
        "accent-orange": "hsl(var(--accent-orange))",
        "accent-yellow": "hsl(var(--accent-yellow))",
        "accent-violet": "hsl(var(--accent-violet))",
        "accent-emerald": "hsl(var(--accent-emerald))",
        "glass-border": "hsl(var(--glass-border))",
        overlay: "hsl(var(--overlay))",
        // Semantic tone scale — the single source of truth for tinted status
        // surfaces. Use these instead of raw palette classes
        // (`bg-emerald-500/15`, `text-rose-700 dark:text-rose-400`, ...).
        tone: {
          success: {
            surface: "hsl(var(--tone-success-surface))",
            border: "hsl(var(--tone-success-border))",
            text: "hsl(var(--tone-success-text))",
          },
          warning: {
            surface: "hsl(var(--tone-warning-surface))",
            border: "hsl(var(--tone-warning-border))",
            text: "hsl(var(--tone-warning-text))",
          },
          danger: {
            surface: "hsl(var(--tone-danger-surface))",
            border: "hsl(var(--tone-danger-border))",
            text: "hsl(var(--tone-danger-text))",
          },
          info: {
            surface: "hsl(var(--tone-info-surface))",
            border: "hsl(var(--tone-info-border))",
            text: "hsl(var(--tone-info-text))",
          },
          accent: {
            surface: "hsl(var(--tone-accent-surface))",
            border: "hsl(var(--tone-accent-border))",
            text: "hsl(var(--tone-accent-text))",
          },
          neutral: {
            surface: "hsl(var(--tone-neutral-surface))",
            border: "hsl(var(--tone-neutral-border))",
            text: "hsl(var(--tone-neutral-text))",
          },
        },
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans Variable", ...defaultTheme.fontFamily.sans],
        mono: ["JetBrains Mono", ...defaultTheme.fontFamily.mono],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Tokenized surface scale. Values equal Tailwind's own xl/2xl/3xl
        // defaults (0.75/1/1.5rem), so this remap is zero-visual-change.
        xl: "var(--radius-control)",
        "2xl": "var(--radius-surface)",
        "3xl": "var(--radius-dialog)",
      },
      fontSize: {
        // Retires the `text-[10px]` / `text-[11px]` arbitrary values used for
        // mono uppercase micro-labels.
        // Size only — tracking belongs to the label component, not the token,
        // so these also fit non-uppercase captions.
        micro: ["0.625rem", { lineHeight: "0.875rem" }],
        "micro-lg": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        glass: "var(--glass-shadow)",
        "glass-lg": "0 8px 32px -8px rgb(0 0 0 / 0.25)",
      },
      backgroundImage: {
        glass: "linear-gradient(180deg, hsl(var(--glass-bg)) 0%, hsl(var(--glass-bg)) 100%)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
