"use client";

import { ChevronUp, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/app/(dashboard)/actions";

export function UserMenu({
  user,
}: {
  user?: { name?: string | null; email?: string | null; image?: string | null } | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-3 border-t border-sidebar-border px-4 py-4 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:bg-sidebar-accent">
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
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-56">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{user?.name}</p>
          {user?.email ? (
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <form action={signOutAction} className="w-full">
            <button
              type="submit"
              className="flex w-full items-center gap-2 text-left"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
