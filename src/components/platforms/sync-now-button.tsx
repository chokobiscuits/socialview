"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { syncNow } from "@/app/(dashboard)/platforms/actions";

export function SyncNowButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function onClick() {
    setMessage(null);
    startTransition(async () => {
      try {
        const { synced, failed } = await syncNow();
        setMessage(
          failed > 0
            ? `${synced} synced, ${failed} failed`
            : `Synced ${synced} ${synced === 1 ? "channel" : "channels"}`,
        );
      } catch {
        setMessage("Sync failed");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {message ? (
        <span className="text-xs text-muted-foreground">{message}</span>
      ) : null}
      <Button onClick={onClick} disabled={pending} variant="outline" size="sm">
        <RefreshCw className={cn("size-4", pending && "animate-spin")} />
        {pending ? "Syncing..." : "Sync now"}
      </Button>
    </div>
  );
}
