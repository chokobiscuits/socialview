import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SocialView",
  description: "Your video performance across every platform, on one screen.",
  // Domain-ownership proofs the platform developer portals check by fetching a
  // meta tag from the site root. These are public verification tokens, not
  // secrets, so they live here directly. Meta's is added when we set up the
  // Instagram app.
  other: {
    "tiktok-developers-site-verification": "eXciqJ6DLslXX4Z1qvhu9NvfvmOv4jLY",
    ...(process.env.NEXT_PUBLIC_FB_VERIFICATION
      ? { "facebook-domain-verification": process.env.NEXT_PUBLIC_FB_VERIFICATION }
      : {}),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
