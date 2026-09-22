import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f1f8ee",
          100: "#dcefd5",
          500: "#4f8f45",
          600: "#2f6b36",
          700: "#24552d",
        },
        accent: {
          400: "#f3c84b",
          500: "#e5ae24",
        },
        ink: {
          DEFAULT: "#23332a",
          soft: "#68766b",
        },
        bg: "#fbfcf8",
        surface: "#ffffff",
        link: "#2f6b36",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)"],
      },
      borderRadius: {
        card: "16px",
      },
    },
  },
  plugins: [],
};

export default config;