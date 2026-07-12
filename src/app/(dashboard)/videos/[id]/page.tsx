import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { auth } from "@/auth";
import { Thumbnail } from "@/components/videos/thumbnail";
import { VideoAreaChart } from "@/components/videos/video-area-chart";
import { EmptyChartState } from "@/components/dashboard/empty-chart-state";
import { PLATFORM_META } from "@/lib/platforms";
import { formatFull, formatRelative } from "@/lib/format";
import { parseRange, resolveWindow, RANGE_LABELS, RANGE_KEYS } from "@/lib/ranges";
import { getVideoDetail, getVideoSeries } from "@/server/queries/videos";

// A single video's view history, one point per hourly snapshot bucket.

function labelsFor(series: { t: Date }[]): {
  short: (t: Date) => string;
  full: (t: Date) => string;
} {
  const withinTwoDays =
    series.length < 2 ||
    series[series.length - 1].t.getTime() - series[0].t.getTime() <=
      48 * 3600e3;
  return {
    short: withinTwoDays
      ? (t) => t.toLocaleTimeString("en-US", { hour: "numeric", hour12: true })
      : (t) => t.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    full: (t) =>
      t.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        hour12: true,
      }),
  };
}

export default async function VideoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { id } = await params;
  const range = parseRange((await searchParams).range);
  const window = resolveWindow(range);

  const [video, series] = await Promise.all([
    getVideoDetail(userId, id),
    getVideoSeries(userId, id, window),
  ]);
  if (!video) notFound();

  const hasHistory = series.length >= 2;
  const fmt = labelsFor(series);
  const chartData = series.map((p) => ({
    t: p.t.getTime(),
    label: fmt.short(p.t),
    full: fmt.full(p.t),
    views: p.views,
  }));

  const { Icon, chipClass, label } = PLATFORM_META[video.platform];

  const stats = [
    { label: "Views", value: formatFull(video.views) },
    { label: "Likes", value: formatFull(video.likes) },
    { label: "Comments", value: formatFull(video.comments) },
    {
      label: "Posted",
      value: video.publishedAt ? formatRelative(video.publishedAt) : "—",
    },
  ];

  return (
    <>
      <div className="pb-6">
        <Link
          href="/videos"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> All Videos
        </Link>

        <div className="mt-4 flex items-start gap-4">
          <Thumbnail
            src={video.thumbnailUrl}
            alt=""
            className="h-[68px] w-[121px] shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`grid size-6 place-items-center rounded-md ${chipClass}`}
                title={label}
              >
                <Icon className="size-3.5" />
              </span>
              {video.channel ? (
                <span className="text-xs text-muted-foreground">
                  {video.channel}
                </span>
              ) : null}
            </div>
            <h1 className="mt-1.5 text-xl font-semibold leading-snug break-words">
              {video.title}
            </h1>
            {video.permalink ? (
              <a
                href={video.permalink}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Open on {label} <ExternalLink className="size-3" />
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Views over time</h2>
          <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
            {RANGE_KEYS.map((k) => (
              <Link
                key={k}
                href={`/videos/${video.id}?range=${k}`}
                scroll={false}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  k === range
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {RANGE_LABELS[k].replace("Last ", "").replace("All time", "All")}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-4 h-[300px]">
          {hasHistory ? (
            <VideoAreaChart data={chartData} />
          ) : (
            <EmptyChartState className="h-full" />
          )}
        </div>
      </section>
    </>
  );
}
