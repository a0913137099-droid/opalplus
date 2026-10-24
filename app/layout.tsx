import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bloom｜AI 工作流程",
  description: "編輯流程，輸入需求，執行並下載社群圖文。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className="antialiased">{children}</body>
    </html>
  );
}
