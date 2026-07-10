import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Sidebar } from "@/components/layout/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // proxy.ts only sniffs for a session cookie. This is the real check.
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-full flex-1">
      <Sidebar user={session.user} />
      {/* min-w-0 is load-bearing: without it a flex child refuses to shrink
          below its content width, and the right rail overflows the viewport. */}
      <main className="min-w-0 flex-1 px-8 py-7">{children}</main>
    </div>
  );
}
