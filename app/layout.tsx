import type { Metadata } from "next";
import "./globals.css";
import "./interaction-overrides.css";
import PlazaPanel from "@/components/plaza-panel";

export const metadata: Metadata = {
  metadataBase: new URL("https://type-drift.vercel.app"),
  title: { default: "類型の秘密メモ｜Type Drift", template: "%s｜Type Drift" },
  description: "診断のあとに立ち寄れる海。類型のこと、自分のこと、言葉にしづらい小さな違和感を匿名のボトルに入れて流せます。",
  keywords: ["類型", "MBTI", "ソシオニクス", "エニアグラム", "匿名投稿", "秘密メモ", "Type Drift"],
  applicationName: "Type Drift",
  category: "community",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "Type Drift",
    title: "類型の秘密メモ｜Type Drift",
    description: "診断のあとに立ち寄れる海。思考を匿名のボトルに入れて流そう。",
    images: [{ url: "/opengraph-image?v=2", width: 1200, height: 630, alt: "Type Drift — 類型の秘密メモ", type: "image/png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "類型の秘密メモ｜Type Drift",
    description: "診断のあとに立ち寄れる海。思考を匿名のボトルに入れて流そう。",
    images: ["/opengraph-image?v=2"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}<PlazaPanel /></body></html>;
}
