import "./globals.css";
import { Figtree } from "next/font/google";
const font = Figtree({ subsets: ["latin"], variable: "--font-figtree" });
export const metadata = { title: "ConsultEase" };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className={`${font.variable} font-sans`}>{children}</body></html>;
}
