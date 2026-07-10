"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { runSync } from "@/services/sync/run-sync";

/**
 * "Sync now". The hourly Vercel Cron calls runSync() for everyone; this calls
 * it for the signed-in user only, so one person's manual refresh cannot stall
 * behind another's.
 */
export async function syncNow(): Promise<{ synced: number; failed: number }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  const summary = await runSync(session.user.id);

  revalidatePath("/platforms");
  revalidatePath("/dashboard");
  revalidatePath("/videos");
  return { synced: summary.synced, failed: summary.failed };
}

/**
 * Disconnect a channel. Cascades to its videos and their snapshots, so the
 * history is genuinely gone: the platform APIs only ever return "views right
 * now", and it cannot be rebuilt.
 */
export async function disconnect(connectionId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  // Scope the delete to the caller: never let one user delete another's row.
  const { count } = await prisma.platformConnection.deleteMany({
    where: { id: connectionId, userId: session.user.id },
  });
  if (count === 0) throw new Error("Connection not found");

  revalidatePath("/platforms");
  revalidatePath("/dashboard");
}
