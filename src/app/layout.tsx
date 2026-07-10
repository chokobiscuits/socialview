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
  // Domain-ownership proofs that platform developer portals check by fetching a
  // meta tag from the site root. Set as env vars so a signature is never
  // hardcoded; unset ones simply omit the tag.
  other: {
    ...(process.env.NEXT_PUBLIC_TIKTOK_VERIFICATION
      ? {
          "tiktok-developers-site-verification":
            process.env.NEXT_PUBLIC_TIKTOK_VERIFICATION,
        }
      : {}),
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
