// Padrão Tailwind pra cor themável via CSS var (suporta opacidade tipo bg-gold/10)
function withOpacity(varName: string) {
  return ({ opacityValue }: { opacityValue?: string }) =>
    opacityValue !== undefined
      ? `rgb(var(${varName}) / ${opacityValue})`
      : `rgb(var(${varName}))`;
}

// (sem tipo Config explícito de propósito — a tipagem oficial não cobre
// cores como função, mas o Tailwind aceita isso normalmente em runtime)
const config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // As funções withOpacity são o padrão oficial do Tailwind pra cor via
      // CSS var com suporte a opacidade (bg-gold/10 etc.) — a tipagem do
      // Config não cobre esse padrão, daí o "as any" aqui.
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        imperium: {
          bg: withOpacity("--c-bg"),
          surface: withOpacity("--c-surface"),
          raised: withOpacity("--c-raised"),
          line: withOpacity("--c-line"),
          "line-strong": withOpacity("--c-line-strong"),
        },
        gold: {
          DEFAULT: withOpacity("--c-gold"),
          bright: withOpacity("--c-gold-bright"),
          dim: withOpacity("--c-gold-dim"),
        },
        wine: {
          DEFAULT: withOpacity("--c-wine"),
          bright: withOpacity("--c-wine-bright"),
        },
        templar: withOpacity("--c-templar"),
        maximus: withOpacity("--c-maximus"),
        stone: {
          50: withOpacity("--stone-50"),
          100: withOpacity("--stone-100"),
          200: withOpacity("--stone-200"),
          300: withOpacity("--stone-300"),
          400: withOpacity("--stone-400"),
          500: withOpacity("--stone-500"),
          600: withOpacity("--stone-600"),
          700: withOpacity("--stone-700"),
          800: withOpacity("--stone-800"),
          900: withOpacity("--stone-900"),
        },
      },
      fontFamily: {
        display: ["var(--font-cinzel)", "serif"],
        serif: ["var(--font-garamond)", "Georgia", "serif"],
      },
      backgroundImage: {
        "laurel-glow":
          "radial-gradient(circle at 50% 0%, rgb(var(--c-gold) / 0.10), transparent 60%)",
      },
    },
  },
  plugins: [],
};
export default config;
