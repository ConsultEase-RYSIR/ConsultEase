import type { Config } from "tailwindcss";
export default { content: ["./src/**/*.{ts,tsx}"], theme: { extend: {
  colors: { ink: "#0f2132", brand: "#0b5c7a", accent: "#2aa5c9", canvas: "#f3f4f6", tint: "#e1eff5", line: "#e3e6ea", muted: "#5f6b7a" },
  fontFamily: { sans: ["var(--font-figtree)", "system-ui", "sans-serif"] } } }, plugins: [] } satisfies Config;
