import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";
import Providers from "./providers";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cachetify",
  description: "Secure Digital Contract Management on Blockchain",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {process.env.NEXT_PUBLIC_MOCK_BLOCKCHAIN === 'true' && (
          <div style={{
            backgroundColor: '#FF9800',
            color: '#fff',
            textAlign: 'center',
            padding: '8px',
            fontWeight: 'bold',
            zIndex: 9999,
            position: 'relative'
          }}>
            MODE DÉMO : Les transactions blockchain sont simulées.
          </div>
        )}
        <NextTopLoader color="#9C27B0" showSpinner={false} />
        <Providers>
          {children}
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
