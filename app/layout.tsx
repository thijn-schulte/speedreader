import type { Metadata } from "next";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "Speedreader — lees op jouw tempo",
  description: "Lees je eigen tekst of EPUB in een rustig tempo op je iPhone.",
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: `${basePath}/icon-192.png`,
    apple: `${basePath}/icon-192.png`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
