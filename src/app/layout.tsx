import type { Metadata } from "next";
import { Geist, Geist_Mono, Figtree } from "next/font/google";
import "./globals.css";
import Image from 'next/image';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "VNyTe - Ứng dụng quản lý khám chữa bệnh",
  description: "Ứng dụng quản lý khám chữa bệnh hiện đại và tiện lợi",
  icons: {
    icon: "/logo.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body
        className={`${figtree.variable} font-sans antialiased`}
        style={{ fontFamily: 'var(--font-figtree), system-ui, sans-serif' }}
        suppressHydrationWarning
      >
        <header className="w-full flex items-center justify-center py-2 bg-white/80 shadow-sm mb-1">
          <Image
            src="/icondt.png"
            width={20}
            height={24}
            className="mr-2"
            alt="VNyTe Logo"
            priority
          />
          <span className="text-xl font-bold">VNyTe - Ứng dụng quản lý khám chữa bệnh</span>
        </header>
        {children}
      </body>
    </html>
  );
}
