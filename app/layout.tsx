import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Удам — Ургийн мод",
  description: "Гэр бүлийн түүхээ холбож, ургийн модоо бүтээгээрэй. Монгол ургийн модны хэрэгсэл.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="mn">
      <body>{children}</body>
    </html>
  );
}
