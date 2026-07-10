"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  ChevronUp,
  Home,
  LayoutGrid,
  Settings,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: Home },
  { href: "/videos", label: "All Videos", Icon: Video },
  { href: "/analytics", label: "Analytics", Icon: BarChart3 },
  { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/platforms", label: "Platforms", Icon: LayoutGrid },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function Sidebar({
  user,
}: {
  user?: { name?: string | null; image?: string | null } | null;
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-6 py-6">
        <div className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
          <BarChart3 className="size-5" />
        </div>
        <span className="text-lg font-semibold tracking-tight">SocialView</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              <Icon className="size-[18px]" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-4">
        <Avatar className="size-9">
          {user?.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback>
            {user?.name?.[0]?.toUpperCase() ?? "?"}
          </AvatarFallback>
        </Avatar>
        <span className="flex-1 truncate text-sm font-medium">
          {user?.name ?? "Not signed in"}
        </span>
        <ChevronUp className="size-4 text-muted-foreground" />
      </div>
    </aside>
  );
}
