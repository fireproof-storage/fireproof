import containerQueries from "@tailwindcss/container-queries";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        main: ["var(--font-family-main)", "Inter", "sans-serif"],
        body: ["var(--font-family-body)", "Inter", "sans-serif"],
        mono: ["var(--font-family-mono)", "monospace"],
      },
      fontSize: {
        xxl: "34px",
        xl: "20px",
        l: "16px",
        m: "14px",
        s: "13px",
        xs: "11px",
      },
      lineHeight: {
        xxl: "42px",
        xl: "25px",
        l: "24px",
        m: "22px",
        s: "17px",
        xs: "14px",
      },
      letterSpacing: {
        tighter: "-0.04em",
        tight: "-0.02em",
        wide: "0.02em",
      },
      fontWeight: {
        medium: 500,
        semibold: 600,
        bold: 700,
      },
      colors: {
        "fp-p": "var(--fp-color-primary)",
        "fp-s": "var(--fp-color-secondary)",
        "fp-a-00": "var(--fp-color-accent-00)",
        "fp-a-01": "var(--fp-color-accent-01)",
        "fp-a-02": "var(--fp-color-accent-02)",
        "fp-a-03": "var(--fp-color-accent-03)",
        "fp-dec-00": "var(--fp-color-decorative-00)",
        "fp-dec-01": "var(--fp-color-decorative-01)",
        "fp-dec-02": "var(--fp-color-decorative-02)",
        "fp-bg-00": "var(--fp-color-background-00)",
        "fp-bg-01": "var(--fp-color-background-01)",
        "fp-bg-02": "var(--fp-color-background-02)",
        "fp-red": "var(--fp-color-red)",
        "fp-green": "var(--fp-color-green)",
      },
      padding: {
        main: "20px",
        card: "28px",
      },
      borderRadius: {
        "fp-s": "4px",
        "fp-l": "20px",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        dash500: {
          "0%": { "stroke-dashoffset": "-500" },
          "100%": { "stroke-dashoffset": "0" },
        },
        dash2000: {
          "0%": { "stroke-dashoffset": "-2000" },
          "30%": { "stroke-dashoffset": "-2000" },
          "100%": { "stroke-dashoffset": "0" },
        },
        show: {
          "0%": { opacity: 0 },
          "70%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "stroke-dash-500": "dash500 1.5s ease forwards",
        "stroke-dash-2000": "dash2000 3s ease forwards",
        show: "show 3s ease forwards",
      },
      screens: {
        xs: "460px",
        lg: "1160px",
        xxl: "1600px",
      },
    },
  },
  plugins: [containerQueries],
};
