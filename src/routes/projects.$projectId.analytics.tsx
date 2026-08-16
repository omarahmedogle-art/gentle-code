import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app-shell";
import { ProjectHeader, useColumns, useTasks } from "@/components/project-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const tooltipProps = {
  cursor: { fill: "var(--muted)", fillOpacity: 0.35 },
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "0.75rem",
    color: "var(--popover-foreground)",
    boxShadow: "var(--shadow-soft)",
    textTransform: "capitalize" as const,
  },
  labelStyle: { color: "var(--popover-foreground)", fontWeight: 600 },
  itemStyle: { color: "var(--popover-foreground)" },
};

const legendProps = {
  wrapperStyle: { fontSize: 12, color: "var(--muted-foreground)", textTransform: "capitalize" as const },
};

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
      const done = tasks.filter(
        (t) => t.completed_at && new Date(t.completed_at) <= day,
      ).length;
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProjectHeader projectId={projectId} />
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total tasks", value: tasks.length },
            { label: "Completed", value: completed },
            { label: "Hours logged", value: totalLogged },
            { label: "Hours estimated", value: totalEstimated },
          ].map((stat) => (
            <Card key={stat.label} className="surface-panel">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="text-base">Burndown (14 days)</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={burndown}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} />
                  <YAxis tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} allowDecimals={false} />
                  <Tooltip {...tooltipProps} />
                  <Legend {...legendProps} />
                  <Line
                    type="monotone"
                    name="Remaining"
                    dataKey="remaining"
                    stroke={CHART_COLORS[0]}
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    name="Ideal"
                    dataKey="ideal"
                    stroke={CHART_COLORS[1]}
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="text-base">Sprint velocity</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={velocity}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="sprint" tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} />
                  <YAxis tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} allowDecimals={false} />
                  <Tooltip {...tooltipProps} />
                  <Legend {...legendProps} />
                  <Bar name="Completed" dataKey="completed" radius={[6, 6, 0, 0]}>
                    {velocity.map((entry, index) => (
                      <Cell key={entry.sprint} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="text-base">Status distribution</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distribution}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                    stroke="var(--card)"
                    strokeWidth={2}
                  >
                    {distribution.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipProps} />
                  <Legend {...legendProps} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="text-base">Time tracking by priority</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeByPriority}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="priority" tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} />
                  <YAxis tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} />
                  <Tooltip {...tooltipProps} />
                  <Legend {...legendProps} />
                  <Bar name="Estimated" dataKey="estimated" radius={[6, 6, 0, 0]} fillOpacity={0.45}>
                    {timeByPriority.map((entry) => (
                      <Cell key={entry.priority} fill={PRIORITY_COLORS[entry.priority]} />
                    ))}
                  </Bar>
                  <Bar name="Logged" dataKey="logged" radius={[6, 6, 0, 0]}>
                    {timeByPriority.map((entry) => (
                      <Cell key={entry.priority} fill={PRIORITY_COLORS[entry.priority]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
