import { redirect } from "next/navigation";
import { AlertTriangle, Check, Plus } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PLATFORM_META, PLATFORMS, itemNoun, type Platform } from "@/lib/platforms";
import { formatRelative, formatCompact } from "@/lib/format";
import { isConfigured } from "@/services/registry";
import { SyncNowButton } from "@/components/platforms/sync-now-button";
import { DisconnectButton } from "@/components/platforms/disconnect-button";

const ERRORS: Record<string, string> = {
  denied: "You cancelled the connection.",
  missing_code: "The platform did not return an authorization code.",
  bad_state: "That connection link was invalid or expired. Try again.",
  user_mismatch: "That link was issued for a different account.",
  unknown_platform: "That platform is not available.",
  not_configured:
    "This platform has no developer credentials configured on the server yet.",
  no_channel: "This Google account has no YouTube channel.",
  no_refresh_token:
    "The platform did not grant offline access, so we cannot keep stats up to date. Try again.",
  already_claimed:
    "That account is already connected to another SocialView account.",
  exchange_failed: "Could not complete the connection. Try again.",
  store_failed:
    "Connected, but the connection could not be saved. See the server logs.",
  bad_encryption_key:
    "The server's TOKEN_ENCRYPTION_KEY is missing or malformed, so tokens cannot be stored. It must be 32 random bytes, base64 encoded.",
};

type ConnectionRow = {
  id: string;
  platform: Platform;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
  lastSyncedAt: Date | null;
  _count: { videos: number };
  totalViews: number;
};

export default async function PlatformsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { error, connected } = await searchParams;

  const rows = await prisma.platformConnection.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      platform: true,
      displayName: true,
      avatarUrl: true,
      status: true,
      lastSyncedAt: true,
      _count: { select: { videos: true } },
    },
    orderBy: [{ platform: "asc" }, { createdAt: "asc" }],
  });

  // Total views per connection, for the card subtitle.
  const totals = await prisma.video.groupBy({
    by: ["connectionId"],
    where: { userId: session.user.id },
    _sum: { currentViews: true },
  });
  const viewsBy = new Map(
    totals.map((t) => [t.connectionId, Number(t._sum.currentViews ?? 0n)]),
  );

  const connections: ConnectionRow[] = rows.map((r) => ({
    ...r,
    totalViews: viewsBy.get(r.id) ?? 0,
  }));

  const byPlatform = new Map<Platform, ConnectionRow[]>();
  for (const c of connections) {
    const list = byPlatform.get(c.platform) ?? [];
    list.push(c);
    byPlatform.set(c.platform, list);
  }

  const hasAny = connections.length > 0;

  // Connecting a channel is the first thing that ever encrypts a token, so a
  // malformed key stays invisible until the user is halfway through an OAuth
  // flow and then fails as a 500. Check it up front and say so plainly.
  let keyError: string | null = null;
  try {
    void env.tokenEncryptionKey;
  } catch (e) {
    keyError = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4 pb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Platforms</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect a channel to start collecting view counts. You can connect
            more than one per platform.
          </p>
        </div>
        {hasAny ? <SyncNowButton /> : null}
      </header>

      {keyError ? (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">
              Connecting is disabled: the server cannot encrypt tokens.
            </p>
            <p className="mt-1 text-muted-foreground">{keyError}</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>{ERRORS[error] ?? "Something went wrong. Try again."}</span>
        </div>
      ) : null}

      {connected ? (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          <Check className="size-4 shrink-0 text-emerald-500" />
          <span>Connected. Run a sync to pull in your videos.</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-8">
        {PLATFORMS.map((platform) => (
          <PlatformSection
            key={platform}
            platform={platform}
            connections={byPlatform.get(platform) ?? []}
          />
        ))}
      </div>
    </>
  );
}

function PlatformSection({
  platform,
  connections,
}: {
  platform: Platform;
  connections: ConnectionRow[];
}) {
  const { label, Icon, chipClass } = PLATFORM_META[platform];
  const available = isConfigured(platform);
  const href = `/api/connect/${platform.toLowerCase()}`;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`grid size-7 place-items-center rounded-md ${chipClass}`}>
          <Icon className="size-4" />
        </span>
        <h2 className="text-sm font-semibold">{label}</h2>
        {connections.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {connections.length} connected
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {connections.map((c) => (
          <ConnectionCard key={c.id} connection={c} />
        ))}

        {available ? (
          <Button
            asChild
            variant="outline"
            className="h-auto min-h-[104px] justify-center border-dashed text-muted-foreground hover:text-foreground"
          >
            <a href={href}>
              <Plus className="size-4" />
              {connections.length ? `Add another ${label}` : `Connect ${label}`}
            </a>
          </Button>
        ) : (
          <div className="grid min-h-[104px] place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            Coming soon
          </div>
        )}
      </div>
    </section>
  );
}

function ConnectionCard({ connection }: { connection: ConnectionRow }) {
  const needsReauth = connection.status === "NEEDS_REAUTH";
  const name = connection.displayName ?? "Unknown channel";

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <Avatar className="size-9">
          {connection.avatarUrl ? (
            <AvatarImage src={connection.avatarUrl} alt="" />
          ) : null}
          <AvatarFallback>{name[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="text-xs text-muted-foreground">
            {connection._count.videos}{" "}
            {itemNoun(connection.platform, connection._count.videos).toLowerCase()} ·{" "}
            {formatCompact(connection.totalViews)} views
          </div>
        </div>
        {needsReauth ? <Badge variant="destructive">Reconnect</Badge> : null}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {connection.lastSyncedAt
          ? `Synced ${formatRelative(connection.lastSyncedAt).toLowerCase()}`
          : "Never synced"}
      </p>

      <div className="mt-3 flex gap-2">
        {needsReauth ? (
          <Button asChild size="sm" className="flex-1">
            <a href={`/api/connect/${connection.platform.toLowerCase()}`}>
              Reconnect
            </a>
          </Button>
        ) : null}
        <DisconnectButton
          connectionId={connection.id}
          name={name}
          className={needsReauth ? "" : "flex-1"}
        />
      </div>
    </div>
  );
}
