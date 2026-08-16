import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Boxes,
  Command as CommandIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  User as UserIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NotificationCenter } from "@/components/notification-center";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, initials } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import type { Project } from "@/lib/vistrao";
import { cn } from "@/lib/utils";
import vistraoMark from "@/assets/vistrao-mark.png";

export function useProjects() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["projects", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Project[];
    },
  });
}

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data;
    },
  });
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { data: projects = [] } = useProjects();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const links = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/projects", label: "Projects", icon: Boxes },
  ] as const;

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link to="/" className="flex items-center gap-2.5 px-2" onClick={onNavigate}>
        <img src={vistraoMark} alt="Vistrao logo" width={32} height={32} className="size-8 object-contain" />
        <span className="text-lg font-semibold tracking-tight">Vistrao</span>
      </Link>

      <nav className="space-y-1">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              pathname === link.to && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            <link.icon className="size-[18px]" />
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Your projects
        </p>
        <div className="space-y-1">
          {projects.map((project) => (
            <Link
              key={project.id}
              to="/projects/$projectId/board"
              params={{ projectId: project.id }}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                pathname.includes(project.id) && "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              <span className="size-2 shrink-0 rounded-full bg-gradient-brand" />
              <span className="truncate">{project.name}</span>
            </Link>
          ))}
          {projects.length === 0 && (
            <p className="px-3 text-sm text-muted-foreground">No projects yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { data: projects = [] } = useProjects();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  const go = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search projects and pages..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => go(() => navigate({ to: "/dashboard" }))}>
            <LayoutDashboard className="mr-2 size-4" /> Dashboard
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/projects" }))}>
            <Boxes className="mr-2 size-4" /> All projects
          </CommandItem>
        </CommandGroup>
        {projects.length > 0 && (
          <CommandGroup heading="Projects">
            {projects.map((project) => (
              <CommandItem
                key={project.id}
                value={`board ${project.name}`}
                onSelect={() =>
                  go(() =>
                    navigate({ to: "/projects/$projectId/board", params: { projectId: project.id } }),
                  )
                }
              >
                <Boxes className="mr-2 size-4" /> {project.name} — Board
              </CommandItem>
            ))}
            {projects.map((project) => (
              <CommandItem
                key={`a-${project.id}`}
                value={`analytics ${project.name}`}
                onSelect={() =>
                  go(() =>
                    navigate({ to: "/projects/$projectId/analytics", params: { projectId: project.id } }),
                  )
                }
              >
                <BarChart3 className="mr-2 size-4" /> {project.name} — Analytics
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { data: profile } = useProfile();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r bg-sidebar lg:block">
        <SidebarContent />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 flex-1 items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted sm:max-w-sm"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Search...</span>
            <kbd className="hidden items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium sm:flex">
              <CommandIcon className="size-3" />K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </Button>
            <NotificationCenter />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account">
                  <Avatar className="size-8">
                    <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
                    <AvatarFallback className="bg-gradient-brand text-xs text-white">
                      {initials(profile?.full_name, user.email)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="truncate text-sm font-medium">{profile?.full_name || "Member"}</p>
                  <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate({ to: "/dashboard" })}>
                  <UserIcon className="mr-2 size-4" /> Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate({ to: "/projects" })}>
                  <Settings className="mr-2 size-4" /> Projects
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={async () => {
                    await signOut();
                    navigate({ to: "/auth" });
                  }}
                >
                  <LogOut className="mr-2 size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} />
    </div>
  );
}
