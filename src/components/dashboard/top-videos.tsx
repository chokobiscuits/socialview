import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLATFORM_META } from "@/lib/platforms";
import { formatCompact } from "@/lib/format";
import type { TopVideo } from "@/server/queries/summary";
import { Thumbnail } from "@/components/videos/thumbnail";

export function TopVideos({ videos }: { videos: TopVideo[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-medium">
        Top Videos{" "}
        <span className="font-normal text-muted-foreground">(All Time)</span>
      </h2>

      {videos.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          No videos yet. Connect a channel and run a sync.
        </p>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {videos.map((v, i) => {
            const { Icon, chipClass } = PLATFORM_META[v.platform];
            const row = (
              <>
                <span className="w-3 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <Thumbnail
                  src={v.thumbnailUrl}
                  alt=""
                  className="h-8 w-14 shrink-0"
                />
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded ${chipClass}`}
                >
                  <Icon className="size-3" />
                </span>
                <span className="line-clamp-2 flex-1 text-xs leading-snug">
                  {v.title}
                </span>
                <span className="shrink-0 text-xs font-medium tabular-nums">
                  {formatCompact(v.views)}
                </span>
              </>
            );

            return (
              <li key={v.id}>
                {v.permalink ? (
                  <a
                    href={v.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2.5 rounded-md p-1 -m-1 transition-colors hover:bg-accent"
                  >
                    {row}
                  </a>
                ) : (
                  <div className="flex items-center gap-2.5">{row}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <Button asChild variant="secondary" size="sm" className="mt-5 w-full">
        <Link href="/videos">
          View all videos
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
