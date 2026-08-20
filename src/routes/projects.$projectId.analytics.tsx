import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app-shell";
import { ProjectHeader, useColumns, useTasks } from "@/components/project-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PRIORITIES } from "@/lib/vistrao";

export const Route = createFileRoute("/projects/$projectId/analytics")({
  head: () => ({
    meta: [
      { title: "Project Analytics — Vistrao" },
      {
        name: "description",
        content: "Burndown, sprint velocity, status distribution and time tracking insights for your project.",
      },
      { property: "og:title", content: "Project Analytics — Vistrao" },
      { property: "og:description", content: "Track delivery health with burndown, velocity and time charts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <AnalyticsPage />
    </AppShell>
  ),
});

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const PRIORITY_COLORS: Record<string, string> = {
  low: "var(--chart-2)",
  medium: "var(--chart-3)",
  high: "var(--chart-4)",
  urgent: "var(--chart-5)",
};

const AXIS = "var(--muted-foreground)";
const GRID = "var(--border)";

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="animate-fade-in-up rounded-xl border border-border/60 bg-popover/95 px-3.5 py-2.5 shadow-lift backdrop-blur-md">
      {label && (
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-popover-foreground capitalize">
          {label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="size-2.5 rounded-full shadow-sm"
              style={{ background: entry.color || entry.fill, boxShadow: `0 0 8px ${entry.color || entry.fill}` }}
            />
            <span className="text-muted-foreground capitalize">{entry.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-popover-foreground">
              {Number(entry.value).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  index,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  index: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "surface-panel group relative animate-fade-in-up overflow-hidden transition-shadow duration-300 hover:shadow-lift",
        className,
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="pointer-events-none absolute -top-20 left-1/2 h-40 w-3/4 -translate-x-1/2 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100 chart-glow" />
      <CardHeader className="relative">
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent className="relative h-72">{children}</CardContent>
    </Card>
  );
}

function AnalyticsPage() {
  const { projectId } = Route.useParams();
  const { data: tasks = [] } = useTasks(projectId);
  const { data: columns = [] } = useColumns(projectId);

  const burndown = useMemo(() => {
    const days = 14;
    const total = tasks.length;
    return Array.from({ length: days }, (_, i) => {
      const day = new Date();
      day.setDate(day.getDate() - (days - 1 - i));
      day.setHours(23, 59, 59, 999);
      const done = tasks.filter((t) => t.completed_at && new Date(t.completed_at) <= day).length;
      return {
        day: day.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        remaining: total - done,
        ideal: Math.max(0, Math.round(total - (total / (days - 1)) * i)),
      };
    });
  }, [tasks]);

  const velocity = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const end = new Date();
      end.setDate(end.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 7);
      const completed = tasks.filter((t) => {
        if (!t.completed_at) return false;
        const at = new Date(t.completed_at);
        return at > start && at <= end;
      }).length;
      return { sprint: `Week ${4 - i}`, completed };
    }).reverse();
  }, [tasks]);

  const distribution = useMemo(
    () =>
      columns.map((column) => ({
        name: column.title,
        value: tasks.filter((t) => t.column_id === column.id).length,
      })),
    [columns, tasks],
  );

  const timeByPriority = useMemo(
    () =>
      PRIORITIES.map((priority) => {
        const scoped = tasks.filter((t) => t.priority === priority);
        return {
          priority,
          estimated: scoped.reduce((sum, t) => sum + Number(t.estimated_hours ?? 0), 0),
          logged: scoped.reduce((sum, t) => sum + Number(t.logged_hours ?? 0), 0),
        };
      }),
    [tasks],
  );

  const totalLogged = timeByPriority.reduce((sum, r) => sum + r.logged, 0);
  const totalEstimated = timeByPriority.reduce((sum, r) => sum + r.estimated, 0);
  const completed = tasks.filter((t) => t.completed_at).length;
  const completionPct = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

  const radialData = [{ name: "Completion", value: completionPct, fill: "var(--chart-1)" }];

  const stats = [
    { label: "Total tasks", value: tasks.length, icon: "📋", color: "var(--chart-1)" },
    { label: "Completed", value: completed, icon: "✓", color: "var(--chart-3)" },
    { label: "Hours logged", value: totalLogged, icon: "⏱", color: "var(--chart-2)" },
    { label: "Hours estimated", value: totalEstimated, icon: "⌛", color: "var(--chart-4)" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProjectHeader projectId={projectId} />
      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="surface-panel group relative animate-fade-in-up overflow-hidden rounded-xl border p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div
                className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full opacity-20 blur-2xl transition-opacity duration-500 group-hover:opacity-40"
                style={{ background: stat.color }}
              />
              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{stat.value}</p>
                </div>
                <span
                  className="grid size-11 place-items-center rounded-xl text-lg shadow-soft"
                  style={{ background: `color-mix(in oklch, ${stat.color} 14%, transparent)`, color: stat.color }}
                >
                  {stat.icon}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <ChartCard
            title="Delivery health"
            subtitle="Completion rate across all tasks"
            index={4}
            className="lg:col-span-1"
          >
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                innerRadius="68%"
                outerRadius="100%"
                data={radialData}
                startAngle={90}
                endAngle={90 - (completionPct / 100) * 360}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar dataKey="value" background={{ fill: "var(--muted)" }} cornerRadius={20}>
                  <Cell fill="var(--chart-1)" />
                </RadialBar>
                <text
                  x="50%"
                  y="50%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-foreground"
                  style={{ fontSize: 28, fontWeight: 700 }}
                >
                  {completionPct}%
                </text>
              </RadialBarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Burndown"
            subtitle="Remaining vs ideal over 14 days"
            index={5}
            className="lg:col-span-2"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={burndown} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="burndownRemaining" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} strokeOpacity={0.5} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} allowDecimals={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--muted)", strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  name="Remaining"
                  dataKey="remaining"
                  stroke="var(--chart-1)"
                  strokeWidth={2.5}
                  fill="url(#burndownRemaining)"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 0, fill: "var(--chart-1)" }}
                />
                <Line
                  type="monotone"
                  name="Ideal"
                  dataKey="ideal"
                  stroke="var(--chart-2)"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard title="Sprint velocity" subtitle="Tasks completed per week" index={6}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={velocity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="velocityBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} strokeOpacity={0.5} vertical={false} />
                <XAxis dataKey="sprint" tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} allowDecimals={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", fillOpacity: 0.3 }} />
                <Bar
                  name="Completed"
                  dataKey="completed"
                  radius={[8, 8, 0, 0]}
                  fill="url(#velocityBar)"
                  maxBarSize={64}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Status distribution" subtitle="Tasks per board column" index={7}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={92}
                  paddingAngle={3}
                  stroke="var(--card)"
                  strokeWidth={3}
                >
                  {distribution.map((entry, index) => (
                    <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
              {distribution.map((entry, i) => (
                <div key={entry.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="size-2.5 rounded-full"
                    style={{
                      background: CHART_COLORS[i % CHART_COLORS.length],
                      boxShadow: `0 0 6px ${CHART_COLORS[i % CHART_COLORS.length]}`,
                    }}
                  />
                  <span className="capitalize">{entry.name}</span>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>

        <ChartCard
          title="Time tracking by priority"
          subtitle="Estimated vs logged hours"
          index={8}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={timeByPriority} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} strokeOpacity={0.5} vertical={false} />
              <XAxis dataKey="priority" tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", fillOpacity: 0.3 }} />
              <Bar name="Estimated" dataKey="estimated" radius={[8, 8, 0, 0]} fillOpacity={0.35} maxBarSize={48}>
                {timeByPriority.map((entry) => (
                  <Cell key={entry.priority} fill={PRIORITY_COLORS[entry.priority]} />
                ))}
              </Bar>
              <Bar name="Logged" dataKey="logged" radius={[8, 8, 0, 0]} maxBarSize={48}>
                {timeByPriority.map((entry) => (
                  <Cell key={entry.priority} fill={PRIORITY_COLORS[entry.priority]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
