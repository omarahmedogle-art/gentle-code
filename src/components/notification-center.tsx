import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck, Undo2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Notification } from "@/lib/vistrao";
import { cn } from "@/lib/utils";

export function NotificationCenter() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const seen = useRef<Set<string>>(new Set());

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Notification[];
    },
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-feed-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
          if (payload.eventType === "INSERT") {
            const row = payload.new as Notification;
            if (!seen.current.has(row.id)) {
              seen.current.add(row.id);
              toast(row.title, { description: row.message });
            }
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const unread = notifications.filter((n) => !n.read).length;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
  }

  async function setRead(item: Notification, read: boolean) {
    await supabase.from("notifications").update({ read }).eq("id", item.id);
    refresh();
  }

  async function markAll() {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    refresh();
  }

  async function openItem(item: Notification) {
    if (!item.read) await setRead(item, true);
    if (item.action_link) {
      setOpen(false);
      navigate({ to: item.action_link } as never);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>
            {unread > 0 ? `${unread} unread update${unread === 1 ? "" : "s"}` : "You're all caught up"}
          </SheetDescription>
          {unread > 0 && (
            <Button variant="outline" size="sm" className="mt-2 w-fit" onClick={markAll}>
              <CheckCheck className="mr-1.5 size-4" /> Mark all read
            </Button>
          )}
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-8.5rem)]">
          <ul className="divide-y">
            {notifications.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "flex gap-3 px-5 py-4 transition-colors hover:bg-muted/50",
                  item.read ? "opacity-60" : "bg-primary/10",
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    item.read ? "bg-transparent" : "bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.2)]",
                  )}
                />
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className={cn("text-sm", item.read ? "font-normal" : "font-semibold")}>{item.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.message}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
                    {item.action_link && <span className="text-primary">View</span>}
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={item.read ? "Mark unread" : "Mark read"}
                  title={item.read ? "Mark as unread" : "Mark as read"}
                  onClick={() => setRead(item, !item.read)}
                >
                  {item.read ? <Undo2 className="size-4" /> : <Check className="size-4" />}
                </Button>
              </li>
            ))}
            {notifications.length === 0 && (
              <li className="px-5 py-16 text-center text-sm text-muted-foreground">No notifications yet.</li>
            )}
          </ul>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
