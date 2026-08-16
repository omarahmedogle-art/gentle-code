import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  Check,
  KanbanSquare,
  Lock,
  Moon,
  Sun,
  Timer,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import heroDark from "@/assets/hero-dark.jpg";
import heroLight from "@/assets/hero-light.jpg";
import vistraoMark from "@/assets/vistrao-mark.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vistrao — Enterprise Project Management & Kanban" },
      {
        name: "description",
        content:
          "Vistrao is an enterprise project management workspace with Kanban boards, sprint analytics, role-based access and real-time notifications.",
      },
      { property: "og:title", content: "Vistrao — Enterprise Project Management & Kanban" },
      {
        property: "og:description",
        content: "Plan sprints, run boards and track delivery analytics in one fast workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: KanbanSquare, title: "Drag & drop boards", body: "Columns, cards, subtasks and comments that move as fast as your team." },
  { icon: BarChart3, title: "Sprint analytics", body: "Burndown, velocity, status distribution and time tracking out of the box." },
  { icon: Lock, title: "Role-based access", body: "Owner, Admin, Member and Viewer permissions enforced in the database." },
  { icon: Bell, title: "Real-time alerts", body: "A live notification centre with unread badges and read/unread toggles." },
  { icon: Users, title: "Team workspaces", body: "Invite teammates, assign work and see who is carrying what." },
  { icon: Timer, title: "Time tracking", body: "Estimated versus logged hours on every task, rolled up per project." },
];

const plans = [
  { name: "Starter", price: "$0", note: "per user / month", features: ["3 projects", "Kanban boards", "Basic analytics"], cta: "Start free" },
  { name: "Team", price: "$12", note: "per user / month", features: ["Unlimited projects", "Sprint analytics", "Roles & permissions", "Notification centre"], cta: "Start free trial", featured: true },
  { name: "Enterprise", price: "Custom", note: "annual billing", features: ["SSO & SAML", "Audit logs", "Dedicated support", "Custom SLAs"], cta: "Talk to sales" },
];

function Landing() {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={vistraoMark} alt="Vistrao logo" width={32} height={32} className="size-8 object-contain" />
            <span className="text-lg font-semibold tracking-tight">Vistrao</span>
          </Link>
          <nav className="ml-6 hidden gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </Button>
            {user ? (
              <Button asChild><Link to="/dashboard">Open app</Link></Button>
            ) : (
              <>
                <Button variant="ghost" asChild><Link to="/auth">Sign in</Link></Button>
                <Button asChild><Link to="/auth">Get started</Link></Button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 -top-40 h-96 bg-gradient-brand opacity-15 blur-3xl" />
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-20 text-center">
          <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            Now with real-time sprint analytics
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
            The project workspace your <span className="text-gradient-brand">delivery team</span> actually enjoys
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Vistrao brings Kanban boards, sprint analytics, granular permissions and real-time notifications
            into one clean, fast interface.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to={user ? "/dashboard" : "/auth"}>{user ? "Open dashboard" : "Start for free"}</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#features">See features</a>
            </Button>
          </div>

          <div className="mt-14 overflow-hidden rounded-2xl border shadow-lift">
            <img
              src={theme === "dark" ? heroDark : heroLight}
              alt="Vistrao Kanban board and analytics dashboard interface"
              width={1600}
              height={1104}
              className="w-full"
            />
          </div>
        </div>
      </section>

      <section id="features" className="border-t bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Everything a delivery team needs</h2>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Purpose-built for teams that plan in sprints and ship continuously.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="surface-panel rounded-xl border p-6">
                <feature.icon className="size-6 text-primary" />
                <h3 className="mt-4 font-semibold">{feature.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Simple, scalable pricing</h2>
          <p className="mt-2 text-muted-foreground">Start free. Upgrade when your team grows.</p>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl border p-7 ${plan.featured ? "border-primary shadow-lift" : "surface-panel"}`}
              >
                {plan.featured && (
                  <span className="mb-3 inline-block rounded-full bg-gradient-brand px-2.5 py-1 text-[11px] font-semibold text-white">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-3 text-4xl font-semibold tracking-tight">{plan.price}</p>
                <p className="text-sm text-muted-foreground">{plan.note}</p>
                <ul className="mt-6 space-y-2.5 text-sm">
                  {plan.features.map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <Check className="size-4 text-primary" /> {item}
                    </li>
                  ))}
                </ul>
                <Button className="mt-7 w-full" variant={plan.featured ? "default" : "outline"} asChild>
                  <Link to="/auth">{plan.cta}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-md bg-gradient-brand text-xs font-bold text-white">
              V
            </span>
            <span className="font-medium text-foreground">Vistrao</span>
          </div>
          <p className="sm:ml-auto">© {new Date().getFullYear()} Vistrao. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
