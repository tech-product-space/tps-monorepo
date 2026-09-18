"use client";
import { useEffect, useMemo, useState } from "react";
import { Wallet, Receipt, Clock, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getSummary, type ExpenseSummary } from "@/services/expenses/expensesService";
import { getTeams, type ExpenseTeam } from "@/services/expenses/expenseFormsService";
import ExpensesNav from "./ExpensesNav";
import { formatCurrency, compactCurrency, toDateParam } from "./expenseUtils";

const ALL = "all";

const monthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  const d = new Date(Number(y), Number(mm) - 1, 1);
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
};

// Shared categorical palette (hex so recharts can paint slices/bars).
const PALETTE = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#0ea5e9", // sky
  "#8b5cf6", // violet
  "#14b8a6", // teal
  "#f97316", // orange
];

const STATUS_COLORS: Record<string, string> = {
  paid: "#10b981",
  pending: "#f59e0b",
  reimbursed: "#0ea5e9",
};

const SOURCE_COLORS: Record<string, string> = {
  internal: "#6366f1",
  external: "#f59e0b",
};

const KpiCard = ({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) => (
  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-start justify-between">
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-semibold mt-1 text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${accent}`}>
      <Icon className="h-5 w-5" />
    </div>
  </div>
);

// Shared tooltip body for the currency charts. `currency` is passed explicitly
// by the chart; recharts injects active/payload/label alongside it.
const MoneyTooltip = ({
  active,
  payload,
  label,
  currency = "INR",
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; payload?: { count?: number } }[];
  label?: string;
  currency?: string;
}) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const count = p.payload?.count;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-gray-900">{label ?? p.name}</p>
      <p className="text-gray-700">{formatCurrency(Number(p.value ?? 0), currency)}</p>
      {typeof count === "number" && <p className="text-gray-400">{count} txn</p>}
    </div>
  );
};

// Loading placeholder that mirrors the dashboard layout (KPI row + chart
// blocks) so the page doesn't jump when the real data arrives.
const DashboardSkeleton = () => (
  <div className="space-y-5">
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-start justify-between"
        >
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-28" />
          </div>
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      ))}
    </div>

    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <Skeleton className="h-4 w-32 mb-4" />
      <Skeleton className="h-[260px] w-full" />
    </div>

    {[0, 1].map((row) => (
      <div key={row} className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <Skeleton className="h-4 w-36 mb-4" />
          <Skeleton className="h-[200px] w-full" />
        </div>
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <Skeleton className="h-4 w-28 mb-4" />
          <Skeleton className="h-[180px] w-full rounded-full mx-auto max-w-[180px]" />
        </div>
      </div>
    ))}
  </div>
);

const ExpensesDashboard = () => {
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [teams, setTeams] = useState<ExpenseTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState(ALL);
  const [teamId, setTeamId] = useState(ALL);
  const [source, setSource] = useState(ALL);
  // "" => let the backend pick the dominant currency; otherwise an explicit code.
  const [currency, setCurrency] = useState("");

  const load = async (
    f = from,
    t = to,
    s = status,
    tm = teamId,
    src = source,
    cur = currency
  ) => {
    try {
      setLoading(true);
      const data = await getSummary({
        from: toDateParam(f),
        to: toDateParam(t),
        status: s === ALL ? undefined : s,
        teamId: tm === ALL ? undefined : tm,
        source: src === ALL ? undefined : src,
        currency: cur || undefined,
      });
      setSummary(data);
      // Reflect the currency the figures are actually in (backend may have
      // chosen the dominant one when none was requested).
      setCurrency(data.currency);
    } catch {
      toast.error("Failed to load summary");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    getTeams()
      .then(setTeams)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const avgMonth = useMemo(() => {
    if (!summary?.byMonth.length) return 0;
    return summary.byMonth.reduce((s, m) => s + m.total, 0) / summary.byMonth.length;
  }, [summary]);

  const pendingTotal = useMemo(
    () => summary?.byStatus.find((s) => s.status === "pending")?.total ?? 0,
    [summary]
  );

  const monthData = useMemo(
    () => (summary?.byMonth ?? []).map((m) => ({ ...m, label: monthLabel(m.month) })),
    [summary]
  );
  const categoryData = useMemo(
    () =>
      (summary?.byCategory ?? []).map((c) => ({
        name: c.categoryName,
        total: c.total,
        count: c.count,
      })),
    [summary]
  );
  const teamData = useMemo(
    () =>
      (summary?.byTeam ?? []).map((t) => ({
        name: t.teamName,
        total: t.total,
        count: t.count,
      })),
    [summary]
  );

  const hasExternal = useMemo(
    () => (summary?.bySource ?? []).some((s) => s.source === "external" && s.total > 0),
    [summary]
  );

  return (
    <div className="flex flex-col h-screen">
      <ExpensesNav />

      <div className="flex-1 bg-gray-50 overflow-auto p-5">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              load(e.target.value, to, status, teamId, source);
            }}
            className="w-40 bg-white"
          />
          <span className="text-gray-400 text-sm">to</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              load(from, e.target.value, status, teamId, source);
            }}
            className="w-40 bg-white"
          />
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              load(from, to, v, teamId, source);
            }}
          >
            <SelectTrigger className="w-36 bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="reimbursed">Reimbursed</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={teamId}
            onValueChange={(v) => {
              setTeamId(v);
              load(from, to, status, v, source);
            }}
          >
            <SelectTrigger className="w-40 bg-white">
              <SelectValue placeholder="Team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All teams</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={source}
            onValueChange={(v) => {
              setSource(v);
              load(from, to, status, teamId, v);
            }}
          >
            <SelectTrigger className="w-36 bg-white">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All sources</SelectItem>
              <SelectItem value="internal">Internal</SelectItem>
              <SelectItem value="external">External</SelectItem>
            </SelectContent>
          </Select>
          {currency && (
            <Select
              value={currency}
              onValueChange={(v) => {
                setCurrency(v);
                load(from, to, status, teamId, source, v);
              }}
            >
              <SelectTrigger className="w-28 bg-white">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                {(summary?.byCurrency.length
                  ? summary.byCurrency.map((c) => c.currency)
                  : [currency]
                ).map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(from || to || status !== ALL || teamId !== ALL || source !== ALL) && (
            <button
              onClick={() => {
                setFrom("");
                setTo("");
                setStatus(ALL);
                setTeamId(ALL);
                setSource(ALL);
                setCurrency("");
                load("", "", ALL, ALL, ALL, "");
              }}
              className="text-sm text-gray-500 hover:text-gray-800 underline"
            >
              Clear
            </button>
          )}
        </div>

        {/* Single-currency reminder when other currencies have spend too. */}
        {summary && summary.byCurrency.length > 1 && (
          <p className="-mt-2 mb-4 text-xs text-gray-500">
            Showing <span className="font-medium text-gray-700">{summary.currency}</span> only — also{" "}
            {summary.byCurrency
              .filter((c) => c.currency !== summary.currency)
              .map((c) => `${c.currency} (${c.count})`)
              .join(", ")}
            . Pick a currency to switch.
          </p>
        )}

        {loading ? (
          <DashboardSkeleton />
        ) : summary ? (
          <div className="space-y-5">
            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <KpiCard
                label={`Total spend (${summary.currency})`}
                value={formatCurrency(summary.total, summary.currency)}
                sub={`${summary.byMonth.length} month(s)`}
                icon={Wallet}
                accent="bg-indigo-50 text-indigo-600"
              />
              <KpiCard
                label="Transactions"
                value={String(summary.count)}
                icon={Receipt}
                accent="bg-emerald-50 text-emerald-600"
              />
              <KpiCard
                label="Avg / transaction"
                value={formatCurrency(summary.count ? summary.total / summary.count : 0, summary.currency)}
                icon={TrendingUp}
                accent="bg-sky-50 text-sky-600"
              />
              <KpiCard
                label="Pending"
                value={formatCurrency(pendingTotal, summary.currency)}
                sub="not yet paid"
                icon={Clock}
                accent="bg-amber-50 text-amber-600"
              />
            </div>

            {summary.count === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-20 text-center text-gray-500">
                No expenses match these filters.
              </div>
            ) : (
              <>
                {/* Monthly trend */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">Monthly trend</h3>
                    <span className="text-xs text-gray-500">
                      Avg{" "}
                      <span className="font-medium text-gray-700">
                        {compactCurrency(Math.round(avgMonth), summary.currency)}
                      </span>
                      /mo
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={monthData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => compactCurrency(Number(v), summary.currency)}
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                        width={56}
                      />
                      <Tooltip content={<MoneyTooltip currency={summary.currency} />} />
                      {avgMonth > 0 && (
                        <ReferenceLine
                          y={avgMonth}
                          stroke="#cbd5e1"
                          strokeDasharray="4 4"
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey="total"
                        stroke="#6366f1"
                        strokeWidth={2}
                        fill="url(#trendFill)"
                        dot={{ r: 3, fill: "#6366f1" }}
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Category + Status */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  {/* By category */}
                  <div className="lg:col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                    <h3 className="font-semibold mb-4 text-gray-900">Spend by category</h3>
                    <ResponsiveContainer
                      width="100%"
                      height={Math.max(180, categoryData.length * 42)}
                    >
                      <BarChart
                        data={categoryData}
                        layout="vertical"
                        margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis
                          type="number"
                          tickFormatter={(v) => compactCurrency(Number(v), summary.currency)}
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={120}
                          tick={{ fontSize: 12, fill: "#475569" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<MoneyTooltip currency={summary.currency} />} cursor={{ fill: "#f8fafc" }} />
                        <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={18}>
                          {categoryData.map((_, i) => (
                            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* By status */}
                  <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                    <h3 className="font-semibold mb-4 text-gray-900">By status</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={summary.byStatus}
                          dataKey="total"
                          nameKey="status"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                        >
                          {summary.byStatus.map((s) => (
                            <Cell key={s.status} fill={STATUS_COLORS[s.status] || "#94a3b8"} />
                          ))}
                        </Pie>
                        <Tooltip content={<MoneyTooltip currency={summary.currency} />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 mt-2">
                      {summary.byStatus.map((s) => {
                        const pct = summary.total ? (s.total / summary.total) * 100 : 0;
                        return (
                          <div
                            key={s.status}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="flex items-center gap-2 capitalize text-gray-700">
                              <span
                                className="h-2.5 w-2.5 rounded-sm"
                                style={{ backgroundColor: STATUS_COLORS[s.status] || "#94a3b8" }}
                              />
                              {s.status}
                              <span className="text-gray-400 text-xs">({s.count})</span>
                            </span>
                            <span className="font-medium text-gray-900">
                              {formatCurrency(s.total, summary.currency)}{" "}
                              <span className="text-gray-400 text-xs">{pct.toFixed(0)}%</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Team + Source */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  {/* By team */}
                  <div className="lg:col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Users className="h-4 w-4 text-gray-400" />
                      <h3 className="font-semibold text-gray-900">Spend by team</h3>
                    </div>
                    {teamData.length === 0 ? (
                      <p className="text-sm text-gray-400 py-10 text-center">No team data.</p>
                    ) : (
                      <ResponsiveContainer
                        width="100%"
                        height={Math.max(180, teamData.length * 46)}
                      >
                        <BarChart
                          data={teamData}
                          layout="vertical"
                          margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#f1f5f9"
                            horizontal={false}
                          />
                          <XAxis
                            type="number"
                            tickFormatter={(v) => compactCurrency(Number(v), summary.currency)}
                            tick={{ fontSize: 11, fill: "#94a3b8" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={120}
                            tick={{ fontSize: 12, fill: "#475569" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip content={<MoneyTooltip currency={summary.currency} />} cursor={{ fill: "#f8fafc" }} />
                          <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={20}>
                            {teamData.map((_, i) => (
                              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* Internal vs external */}
                  <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                    <h3 className="font-semibold mb-4 text-gray-900">Internal vs external</h3>
                    {hasExternal ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={summary.bySource}
                            dataKey="total"
                            nameKey="source"
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={2}
                          >
                            {summary.bySource.map((s) => (
                              <Cell key={s.source} fill={SOURCE_COLORS[s.source] || "#94a3b8"} />
                            ))}
                          </Pie>
                          <Tooltip content={<MoneyTooltip currency={summary.currency} />} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-gray-400 py-10 text-center">
                        All spend is internal.
                      </p>
                    )}
                    <div className="space-y-2 mt-2">
                      {summary.bySource.map((s) => {
                        const pct = summary.total ? (s.total / summary.total) * 100 : 0;
                        return (
                          <div
                            key={s.source}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="flex items-center gap-2 capitalize text-gray-700">
                              <span
                                className="h-2.5 w-2.5 rounded-sm"
                                style={{ backgroundColor: SOURCE_COLORS[s.source] || "#94a3b8" }}
                              />
                              {s.source}
                              <span className="text-gray-400 text-xs">({s.count})</span>
                            </span>
                            <span className="font-medium text-gray-900">
                              {formatCurrency(s.total, summary.currency)}{" "}
                              <span className="text-gray-400 text-xs">{pct.toFixed(0)}%</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ExpensesDashboard;
