import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck, Dot } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "@tanstack/react-router";

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
  const [open, setOpen] = useState(false);

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Notification[];
    },
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => queryClient.invalidateQueries({ queryKey: ["notifications", user.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const unread = notifications.filter((n) => !n.read).length;

  async function toggleRead(item: Notification) {
    await supabase.from("notifications").update({ read: !item.read }).eq("id", item.id);
    queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
  }

  async function markAll() {
    await supabase.from("notifications").update({ read: true }).eq("read", false);
    queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
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
                className={cn("flex gap-3 px-5 py-4 transition-colors", !item.read && "bg-primary/5")}
              >
                <Dot className={cn("mt-0.5 size-5 shrink-0", item.read ? "text-transparent" : "text-primary")} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.message}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
                    {item.action_link && (
                      <Link to="/dashboard" onClick={() => setOpen(false)} className="text-primary hover:underline">
                        View
                      </Link>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={item.read ? "Mark unread" : "Mark read"}
                  onClick={() => toggleRead(item)}
                >
                  <Check className={cn("size-4", item.read && "text-muted-foreground/50")} />
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
