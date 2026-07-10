"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { disconnect } from "@/app/(dashboard)/platforms/actions";

export function DisconnectButton({
  connectionId,
  name,
  className,
}: {
  connectionId: string;
  name: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    // Snapshot history cannot be rebuilt: the platform APIs only ever return
    // the current view total. Make that consequence explicit before deleting.
    const ok = window.confirm(
      `Disconnect ${name}?\n\nIts videos and all recorded view history will be deleted. ` +
        `View history cannot be recovered, because the platform only reports current totals.`,
    );
    if (!ok) return;
    startTransition(() => disconnect(connectionId));
  }

  return (
    <Button
      onClick={onClick}
      disabled={pending}
      variant="ghost"
      size="sm"
      className={className}
    >
      {pending ? "Removing..." : "Disconnect"}
    </Button>
  );
}
