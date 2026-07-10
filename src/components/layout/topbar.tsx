import { RefreshCw } from "lucide-react";
import { DateRangePicker } from "./date-range-picker";
import { formatRelative } from "@/lib/format";
import type { RangeKey } from "@/lib/ranges";

export function Topbar({
  title,
  subtitle,
  range,
  lastSyncedAt,
}: {
  title: string;
  subtitle?: string;
  range: RangeKey;
  lastSyncedAt?: Date | null;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 pb-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-4">
        <DateRangePicker value={range} />
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-4" />
          {lastSyncedAt
            ? `Updated ${formatRelative(lastSyncedAt).toLowerCase()}`
            : "Never synced"}
        </span>
      </div>
    </header>
  );
}
