import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Type Drift — 類型の秘密メモ",
  description: "誰にも言えない類型の話を、匿名のボトルに入れて海へ。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
