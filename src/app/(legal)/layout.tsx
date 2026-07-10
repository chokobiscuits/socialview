import Link from "next/link";
import { BarChart3 } from "lucide-react";

/**
 * Public, unauthenticated shell for the legal pages. TikTok and Meta both
 * verify that the Terms and Privacy URLs are reachable during app review, so
 * these must render without a session.
 */
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col px-6 py-10">
      <Link href="/" className="mb-10 flex items-center gap-2.5">
        <div className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
          <BarChart3 className="size-5" />
        </div>
        <span className="text-lg font-semibold tracking-tight">SocialView</span>
      </Link>
      <article className="prose-legal flex-1">{children}</article>
      <footer className="mt-16 border-t border-border pt-6 text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
        <span className="px-2">·</span>
        <Link href="/terms" className="hover:text-foreground">
          Terms
        </Link>
      </footer>
    </div>
  );
}
