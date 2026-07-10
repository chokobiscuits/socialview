import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Thumbnails and channel avatars are hosted by the platforms, so each CDN
    // must be allowlisted before next/image will optimize it.
    remotePatterns: [
      // YouTube: video thumbnails, and channel avatars.
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
      // TikTok video covers (M8).
      { protocol: "https", hostname: "*.tiktokcdn.com" },
      { protocol: "https", hostname: "*.tiktokcdn-us.com" },
      // Instagram media (M8).
      { protocol: "https", hostname: "*.cdninstagram.com" },
      { protocol: "https", hostname: "*.fbcdn.net" },
    ],
  },
};

export default nextConfig;
