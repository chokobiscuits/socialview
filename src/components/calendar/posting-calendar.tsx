"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLATFORM_META, type Platform } from "@/lib/platforms";
import { formatCompact } from "@/lib/format";

type Post = {
  id: string;
  title: string;
  platform: Platform;
  permalink: string | null;
  publishedAt: string;
  views: number;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function PostingCalendar({ posts }: { posts: Post[] }) {
  // The grid is grouped and laid out in the *viewer's* local timezone, which
  // the server does not know. Rendering it on the server would disagree with
  // the client and trip a hydration mismatch, so we draw it only after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Group posts by local calendar day.
  const byDay = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of posts) {
      const key = ymd(new Date(p.publishedAt));
      (map.get(key) ?? map.set(key, []).get(key)!).push(p);
    }
    return map;
  }, [posts]);

  // Start on the month of the most recent post.
  const latest = posts[0] ? new Date(posts[0].publishedAt) : new Date();
  const [month, setMonth] = useState(
    () => new Date(latest.getFullYear(), latest.getMonth(), 1),
  );
  const [selected, setSelected] = useState<string | null>(null);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const leadingBlanks = first.getDay();

  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1),
    ),
  ];

  const monthLabel = month.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const selectedPosts = selected ? (byDay.get(selected) ?? []) : [];

  // Reserve the layout's footprint until the client takes over, so there is no
  // flash and no server/client divergence.
  if (!mounted) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-h-[520px] rounded-xl border border-border bg-card" />
        <div className="rounded-xl border border-border bg-card" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">{monthLabel}</h2>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Previous month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Next month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="pb-1 text-center text-xs font-medium text-muted-foreground"
            >
              {d}
            </div>
          ))}

          {cells.map((date, i) => {
            if (!date) return <div key={`b${i}`} />;
            const key = ymd(date);
            const dayPosts = byDay.get(key) ?? [];
            const isSelected = selected === key;
            // One dot per platform present that day.
            const platforms = [...new Set(dayPosts.map((p) => p.platform))];

            return (
              <button
                key={key}
                onClick={() =>
                  setSelected(isSelected ? null : dayPosts.length ? key : null)
                }
                disabled={dayPosts.length === 0}
                className={`flex aspect-square flex-col items-center justify-start gap-1 rounded-lg p-1.5 text-sm transition-colors ${
                  isSelected
                    ? "bg-primary/15 ring-1 ring-primary/40"
                    : dayPosts.length
                      ? "hover:bg-accent"
                      : "text-muted-foreground/50"
                }`}
              >
                <span className="tabular-nums">{date.getDate()}</span>
                {platforms.length > 0 ? (
                  <span className="flex gap-0.5">
                    {platforms.map((p) => (
                      <span
                        key={p}
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: PLATFORM_META[p].color }}
                      />
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-4">
          {(Object.keys(PLATFORM_META) as Platform[]).map((p) => (
            <span key={p} className="flex items-center gap-1.5 text-xs">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: PLATFORM_META[p].color }}
              />
              <span className="text-muted-foreground">
                {PLATFORM_META[p].label}
              </span>
            </span>
          ))}
        </div>
      </div>

      <aside className="rounded-xl border border-border bg-card p-5">
        {selected && selectedPosts.length ? (
          <>
            <h3 className="text-sm font-medium">
              {new Date(selectedPosts[0].publishedAt).toLocaleDateString(
                "en-US",
                { weekday: "long", month: "long", day: "numeric" },
              )}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selectedPosts.length}{" "}
              {selectedPosts.length === 1 ? "post" : "posts"}
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {selectedPosts.map((p) => {
                const { Icon, chipClass } = PLATFORM_META[p.platform];
                const inner = (
                  <>
                    <span
                      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded ${chipClass}`}
                    >
                      <Icon className="size-3" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm leading-snug">
                        {p.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatCompact(p.views)} views
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={p.id}>
                    {p.permalink ? (
                      <a
                        href={p.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="flex gap-2.5 rounded-md p-1.5 -m-1.5 transition-colors hover:bg-accent"
                      >
                        {inner}
                      </a>
                    ) : (
                      <div className="flex gap-2.5">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="grid h-full min-h-40 place-items-center text-center text-sm text-muted-foreground">
            Select a day with posts to see what you published.
          </div>
        )}
      </aside>
    </div>
  );
}
