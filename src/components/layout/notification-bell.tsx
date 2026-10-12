"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { notificationsApi, type AppNotification } from "@/lib/api/notifications";
import { cn } from "../ui/utils";

const POLL_INTERVAL_MS = 60_000;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

export function NotificationBell({ collapsed }: { collapsed?: boolean }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = async () => {
    try {
      const response = await notificationsApi.list();
      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
    } catch {
      // Silent — a failed notification fetch shouldn't disrupt the rest of the app.
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const handleOpenChange = async (next: boolean) => {
    setOpen(next);
    if (next && unreadCount > 0) {
      setLoading(true);
      try {
        await notificationsApi.markAllRead();
        setUnreadCount(0);
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      } catch {
        // Non-critical — worst case the unread count stays stale until next poll.
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className={cn(
            "relative flex items-center gap-3 rounded-lg hover:bg-muted transition-colors text-foreground",
            collapsed ? "justify-center px-2 py-3 w-full" : "w-full px-4 py-3"
          )}
        >
          <Bell className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="flex-1 text-left text-sm">Notifications</span>}
          {unreadCount > 0 && (
            <span
              className={cn(
                "flex items-center justify-center rounded-full bg-destructive text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1",
                collapsed && "absolute top-1 right-2"
              )}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="right" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notifications
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Aucune notification pour l'instant.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {notifications.map((n) => {
              const body = (
                <>
                  <p className="text-xs font-semibold">{n.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">{timeAgo(n.createdAt)}</p>
                </>
              );
              return (
                <DropdownMenuItem key={n.id} asChild={!!n.contractCacheId} className={cn("flex flex-col items-start gap-0.5 whitespace-normal py-2.5", !n.read && "bg-primary/5")}>
                  {n.contractCacheId ? (
                    <Link href={`/contract-details?id=${n.contractCacheId}`}>{body}</Link>
                  ) : (
                    <div>{body}</div>
                  )}
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
