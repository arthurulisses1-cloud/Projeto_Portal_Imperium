import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        imperium: {
          bg: "#0a0d16",
          surface: "#12182a",
          raised: "#182036",
          line: "#262f4a",
          "line-strong": "#39456b",
        },
        gold: {
          DEFAULT: "#c9a24a",
          bright: "#e8c874",
          dim: "#8a7038",
        },
        wine: {
          DEFAULT: "#7a2431",
          bright: "#9c3040",
        },
        templar: "#a3272f",
        maximus: "#b08d4f",
      },
      fontFamily: {
        display: ["var(--font-cinzel)", "serif"],
        serif: ["var(--font-garamond)", "Georgia", "serif"],
      },
      backgroundImage: {
        "laurel-glow":
          "radial-gradient(circle at 50% 0%, rgba(201,162,74,0.10), transparent 60%)",
      },
    },
  },
  plugins: [],
};
export default config;
