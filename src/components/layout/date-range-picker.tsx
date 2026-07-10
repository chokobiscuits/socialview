"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Calendar } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RANGE_LABELS, RANGE_KEYS, type RangeKey } from "@/lib/ranges";

/**
 * Range lives in the URL (?range=30d) so Server Components can read it from
 * searchParams and re-query. No client store, and the view stays shareable.
 */
export function DateRangePicker({ value }: { value: RangeKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    const q = new URLSearchParams(params);
    q.set("range", next);
    startTransition(() => router.push(`${pathname}?${q}`));
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label="Date range"
        data-pending={pending || undefined}
        className="w-[190px] bg-card data-pending:opacity-60"
      >
        <Calendar className="size-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RANGE_KEYS.map((k) => (
          <SelectItem key={k} value={k}>
            {RANGE_LABELS[k]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
