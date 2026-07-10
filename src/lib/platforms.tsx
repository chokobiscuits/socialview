import type { SVGProps } from "react";

export const PLATFORMS = ["YOUTUBE", "TIKTOK", "INSTAGRAM"] as const;
export type Platform = (typeof PLATFORMS)[number];

/**
 * Brand marks are inlined rather than pulled from lucide, which ships no
 * trademarked logos. Each takes the current color unless it needs a gradient.
 */
function YouTubeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8ZM9.6 15.6V8.4l6.2 3.6-6.2 3.6Z" />
    </svg>
  );
}

function TikTokIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 1 1 .76-5.06V9.7a5.67 5.67 0 0 0-.76-.05A5.67 5.67 0 1 0 15.54 15.4V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.28 4.28 0 0 1-3.24-1.48Z" />
    </svg>
  );
}

function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2.16c3.2 0 3.58 0 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s0 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58 0-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s0-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16ZM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.9 5.9 0 0 0-2.13 1.38A5.9 5.9 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91a5.9 5.9 0 0 0 1.38 2.13 5.9 5.9 0 0 0 2.13 1.38c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.9 5.9 0 0 0 2.13-1.38 5.9 5.9 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.9 5.9 0 0 0-1.38-2.13A5.9 5.9 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0Zm0 5.84a6.16 6.16 0 1 0 0 12.32A6.16 6.16 0 0 0 12 5.84Zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm7.85-10.4a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0Z" />
    </svg>
  );
}

type PlatformMeta = {
  label: string;
  Icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement;
  /**
   * Series color for charts, which cannot read CSS custom properties.
   *
   * These are brand-derived but tuned for the dark chart surface (#141417) and
   * checked with the dataviz palette validator: all three sit inside the
   * lightness band, clear the chroma floor, keep a worst-case colorblind
   * separation of ΔE 13.7 (deutan), and exceed 3:1 contrast. TikTok's literal
   * brand cyan (#25F4EE) blooms on near-black, so it is darkened here.
   *
   * Identity never rests on hue alone: every sparkline sits in a card that
   * names its platform and shows its icon.
   */
  color: string;
  /** Tailwind classes for the icon chip on cards and table rows. */
  chipClass: string;
};

export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  YOUTUBE: {
    label: "YouTube",
    Icon: YouTubeIcon,
    color: "#eb1526",
    chipClass: "bg-[#FF0000] text-white",
  },
  TIKTOK: {
    label: "TikTok",
    Icon: TikTokIcon,
    color: "#16a8ad",
    chipClass: "bg-black text-white ring-1 ring-white/15",
  },
  INSTAGRAM: {
    label: "Instagram",
    Icon: InstagramIcon,
    color: "#e33bc6",
    chipClass:
      "bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white",
  },
};

/** The accent used for the aggregate "Total Views" area chart. */
export const TOTAL_VIEWS_COLOR = "#6262fb";

/** Instagram counts Reels, the others count Videos. */
export function itemNoun(platform: Platform, count: number): string {
  const noun = platform === "INSTAGRAM" ? "Reel" : "Video";
  return count === 1 ? noun : `${noun}s`;
}
