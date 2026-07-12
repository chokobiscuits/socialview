import Link from "next/link";
import { ArrowDown, LineChart } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PLATFORM_META } from "@/lib/platforms";
import { formatFull, formatCompact, formatRelative } from "@/lib/format";
import type { VideoRow } from "@/server/queries/videos";
import { Thumbnail } from "./thumbnail";

export function VideosTable({
  videos,
  showChannel = false,
}: {
  videos: VideoRow[];
  showChannel?: boolean;
}) {
  if (videos.length === 0) {
    return (
      <div className="grid place-items-center rounded-lg border border-dashed border-border py-16 text-sm text-muted-foreground">
        No videos match.
      </div>
    );
  }

  return (
    // Wide content scrolls inside its own box; the page never scrolls sideways.
    <div className="w-full overflow-x-auto">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[52px]">Platform</TableHead>
            <TableHead>Video</TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center gap-1">
                Views <ArrowDown className="size-3" />
              </span>
            </TableHead>
            <TableHead className="text-right">Likes</TableHead>
            <TableHead className="text-right">Comments</TableHead>
            <TableHead className="text-right">Posted</TableHead>
            <TableHead className="w-[44px]">
              <span className="sr-only">Trend</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {videos.map((v) => {
            const { Icon, chipClass, label } = PLATFORM_META[v.platform];
            return (
              <TableRow key={v.id} className="group">
                <TableCell>
                  <span
                    className={`grid size-8 place-items-center rounded-lg ${chipClass}`}
                    title={label}
                  >
                    <Icon className="size-4" />
                  </span>
                </TableCell>

                <TableCell className="w-full max-w-0">
                  <div className="flex items-center gap-3">
                    <Thumbnail
                      src={v.thumbnailUrl}
                      alt=""
                      className="h-[38px] w-[68px] shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      {v.permalink ? (
                        <a
                          href={v.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="line-clamp-2 text-sm leading-snug break-words hover:underline"
                        >
                          {v.title}
                        </a>
                      ) : (
                        <span className="line-clamp-2 text-sm leading-snug break-words">
                          {v.title}
                        </span>
                      )}
                      {showChannel && v.channel ? (
                        <span className="text-xs text-muted-foreground">
                          {v.channel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </TableCell>

                <TableCell className="text-right text-sm font-medium tabular-nums">
                  {formatFull(v.views)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                  {formatCompact(v.likes)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                  {formatCompact(v.comments)}
                </TableCell>
                <TableCell className="text-right text-sm whitespace-nowrap text-muted-foreground">
                  {v.publishedAt ? formatRelative(v.publishedAt) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/videos/${v.id}`}
                    title="View analytics"
                    className="inline-grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <LineChart className="size-4" />
                    <span className="sr-only">View analytics</span>
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
