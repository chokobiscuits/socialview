import Link from "next/link";
import { BarChart3, ArrowRight } from "lucide-react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * A real 200 landing page rather than an instant redirect. Signed-in visitors
 * still go straight to the dashboard, but an anonymous request returns HTML
 * with a 200 status -- which is what platform domain-verification fetchers need,
 * since many refuse to read a verification meta tag out of a 3xx response.
 */
export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary">
        <BarChart3 className="size-7" />
      </div>

      <h1 className="mt-8 text-4xl font-semibold tracking-tight sm:text-5xl">
        SocialView
      </h1>
      <p className="mt-4 max-w-lg text-balance text-muted-foreground">
        Your video views from YouTube, TikTok, and Instagram, aggregated on one
        screen. Every platform answers &ldquo;how did this video do here?&rdquo;
        SocialView answers &ldquo;how is my content doing?&rdquo;
      </p>

      <Button asChild size="lg" className="mt-8">
        <Link href="/login">
          Sign in
          <ArrowRight className="size-4" />
        </Link>
      </Button>

      <p className="mt-16 text-xs text-muted-foreground">
        <Link href="/privacy" className="underline hover:text-foreground">
          Privacy
        </Link>
        <span className="px-2">·</span>
        <Link href="/terms" className="underline hover:text-foreground">
          Terms
        </Link>
      </p>
    </main>
  );
}
