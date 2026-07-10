"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PLATFORM_META, type Platform } from "@/lib/platforms";
import { SORTS, SORT_LABELS, type Sort } from "@/lib/video-sort";

const ALL = "__all__";

/**
 * Search, filter, and sort all live in the URL so the Server Component can read
 * them from searchParams and re-query. No client store, and any view is
 * shareable. Per the interaction spec, filters sit in one row above the data.
 */
export function VideosToolbar({
  query,
  platform,
  sort,
  platforms,
}: {
  query: string;
  platform: Platform | null;
  sort: Sort;
  /** Only platforms the user has actually connected. */
  platforms: Platform[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [text, setText] = useState(query);

  function push(mutate: (q: URLSearchParams) => void) {
    const q = new URLSearchParams(params);
    mutate(q);
    startTransition(() => router.replace(`${pathname}?${q}`, { scroll: false }));
  }

  // Debounce typing so we do not re-query on every keystroke.
  useEffect(() => {
    if (text === query) return;
    const id = setTimeout(() => {
      push((q) => {
        if (text) q.set("q", text);
        else q.delete("q");
      });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search videos..."
          aria-label="Search videos"
          className="pl-9"
        />
      </div>

      {platforms.length > 1 ? (
        <Select
          value={platform ?? ALL}
          onValueChange={(v) =>
            push((q) => {
              if (v === ALL) q.delete("platform");
              else q.set("platform", v);
            })
          }
        >
          <SelectTrigger className="w-[150px]" aria-label="Filter by platform">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Platforms</SelectItem>
            {platforms.map((p) => (
              <SelectItem key={p} value={p}>
                {PLATFORM_META[p].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Select value={sort} onValueChange={(v) => push((q) => q.set("sort", v))}>
        <SelectTrigger className="w-[160px]" aria-label="Sort videos">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORTS.map((s) => (
            <SelectItem key={s} value={s}>
              {SORT_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
