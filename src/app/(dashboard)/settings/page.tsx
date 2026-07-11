import { redirect } from "next/navigation";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/(dashboard)/actions";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [connectionCount, videoCount] = await Promise.all([
    prisma.platformConnection.count({ where: { userId: session.user.id } }),
    prisma.video.count({ where: { userId: session.user.id } }),
  ]);

  return (
    <>
      <header className="pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account and connected data.
        </p>
      </header>

      <div className="flex max-w-2xl flex-col gap-6">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-medium">Account</h2>
          <div className="mt-4 flex items-center gap-4">
            <Avatar className="size-12">
              {session.user.image ? (
                <AvatarImage src={session.user.image} alt="" />
              ) : null}
              <AvatarFallback>
                {session.user.name?.[0]?.toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="font-medium">{session.user.name}</div>
              <div className="truncate text-sm text-muted-foreground">
                {session.user.email}
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Signed in with Google. SocialView only ever received your name and
            email at sign-in.
          </p>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-medium">Connected data</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-muted-foreground">Connections</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {connectionCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Videos tracked</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {videoCount}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Manage or disconnect individual accounts on the{" "}
            <Link href="/platforms" className="underline hover:text-foreground">
              Platforms
            </Link>{" "}
            page. Disconnecting deletes that account&apos;s stored token, videos,
            and view history.
          </p>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-medium">Session</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign out of SocialView on this device.
          </p>
          <form action={signOutAction} className="mt-4">
            <Button type="submit" variant="outline" size="sm">
              <LogOut className="size-4" />
              Sign out
            </Button>
          </form>
        </section>
      </div>
    </>
  );
}
