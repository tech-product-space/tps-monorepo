"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Zap } from "lucide-react";

import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent } from "@/gradient/components/ui/card";
import { Checkbox } from "@/gradient/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import { Switch } from "@/gradient/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import Pagination, {
  type IPaginationMeta,
} from "@/gradient/components/ui/custom/Pagination";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { cn } from "@/gradient/lib/utils";
import { metaService } from "@/gradient/services/metaService";
import type {
  MetaAccount,
  MetaPollLog,
  MetaSettings,
  MetaStats,
} from "@/gradient/types/meta";

interface Props {
  accounts: MetaAccount[];
  /**
   * Super Admin. Only gates the polling switch — pausing ingestion stops every
   * page at once, which is strictly broader than disabling one account, and
   * that is already Super Admin. Fetch now and Sync forms stay open: they make
   * the integration do sooner what it would do anyway.
   */
  canManage: boolean;
}

/**
 * How long since the last poll before something is actually wrong.
 *
 * The schedule is five minutes. Two missed cycles is noise — a slow Graph call,
 * a deploy — but past that the scheduler is not running and no amount of
 * staring at an empty run history will say so.
 */
const POLL_STALE_MS = 15 * 60 * 1000;

const describeAge = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);

  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
};

const EMPTY_META: IPaginationMeta = {
  total: 0,
  page: 1,
  limit: 10,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

const ALL = "__all__";

const WINDOWS = [
  { value: "24", label: "Last 24 hours" },
  { value: "168", label: "Last 7 days" },
  { value: "720", label: "Last 30 days" },
];

const Tile = ({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "danger";
}) => (
  <Card>
    <CardContent className="pt-6">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold",
          tone === "danger" && value !== 0 && "text-rose-600",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </CardContent>
  </Card>
);

const MonitoringTab = ({ accounts, canManage }: Props) => {
  const [settings, setSettings] = useState<MetaSettings | null>(null);
  const [stats, setStats] = useState<MetaStats | null>(null);
  const [logs, setLogs] = useState<MetaPollLog[]>([]);
  const [meta, setMeta] = useState<IPaginationMeta>(EMPTY_META);

  const [hours, setHours] = useState("24");
  const [accountId, setAccountId] = useState(ALL);
  const [onlyInteresting, setOnlyInteresting] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [busy, setBusy] = useState(false);

  const scopedAccount = accountId === ALL ? undefined : accountId;

  const load = useCallback(async () => {
    try {
      const [settingsRes, statsRes, logsRes] = await Promise.all([
        metaService.getSettings(),
        metaService.getStats(Number(hours), scopedAccount),
        metaService.listLogs({
          page,
          limit,
          accountId: scopedAccount,
          onlyInteresting,
        }),
      ]);

      setSettings(settingsRes.data);
      setStats(statsRes.data);
      setLogs(logsRes.data || []);
      setMeta(logsRes.meta || EMPTY_META);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not load monitoring data"));
    }
  }, [hours, scopedAccount, page, limit, onlyInteresting]);

  useEffect(() => {
    load();
  }, [load]);

  const togglePolling = async (enabled: boolean) => {
    setBusy(true);

    try {
      const res = await metaService.setPollEnabled(enabled);
      toast.success(res.message);
      load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not change polling"));
    } finally {
      setBusy(false);
    }
  };

  const trigger = async (
    action: () => Promise<{ message?: string }>,
    fallback: string,
  ) => {
    setBusy(true);

    try {
      const res = await action();
      toast.success(res.message || "Done");
      load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, fallback));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div className="flex items-center gap-3">
            {/* Disabled, not hidden: whether ingestion is running is
                information everyone needs — only changing it is restricted. */}
            <Switch
              checked={settings?.pollEnabled ?? false}
              onCheckedChange={togglePolling}
              disabled={busy || !settings || !canManage}
            />
            <div>
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {settings?.pollEnabled ? "Polling is on" : "Polling is paused"}

                {/*
                  An explicit health verdict, because the run history cannot
                  give one: a poll that finds nothing writes the same "0
                  fetched" row as a poll that is not running at all, and with
                  empty runs hidden both look like an empty table.
                */}
                {settings?.pollEnabled && settings.lastPollAt && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-normal",
                      Date.now() - new Date(settings.lastPollAt).getTime() >
                        POLL_STALE_MS
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700",
                    )}
                  >
                    Last run {describeAge(settings.lastPollAt)}
                  </Badge>
                )}

                {settings?.pollEnabled && !settings.lastPollAt && (
                  <Badge
                    variant="outline"
                    className="border-amber-200 bg-amber-50 font-normal text-amber-800"
                  >
                    Never run
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Checks every active form every five minutes. A run that finds no
                new leads is still a healthy run.
                {!canManage && " Only a Super Admin can change this."}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => trigger(metaService.pollNow, "Could not fetch leads")}
            >
              <Zap className="mr-1.5 h-3.5 w-3.5" />
              Fetch leads now
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => trigger(metaService.syncAll, "Could not sync forms")}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Sync all forms
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Select value={hours} onValueChange={setHours}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WINDOWS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={accountId}
          onValueChange={(value) => {
            setAccountId(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All pages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All pages</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {stats && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="Runs" value={stats.runs} />
          <Tile label="Fetched" value={stats.fetched} />
          <Tile label="New leads" value={stats.newLeads} />
          {/*
            Expected to be large, and labelled so nobody reads it as waste: the
            poll asks for 10 minutes every 5, so it re-sees every lead once by
            design. This is not the `duplicate` lead status.
          */}
          <Tile
            label="Already had"
            value={stats.alreadyImported}
            hint="Re-seen by the overlap window — normal"
          />
          <Tile
            label="No contact"
            value={stats.skipped}
            hint="Form collected neither email nor phone"
          />
          <Tile label="Errors" value={stats.errors} tone="danger" />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b px-6 py-3">
            <h4 className="text-sm font-medium">Run history</h4>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={onlyInteresting}
                onCheckedChange={(checked) => {
                  setOnlyInteresting(Boolean(checked));
                  setPage(1);
                }}
              />
              {/* Most runs find nothing; showing them all buries the ones that matter. */}
              Hide empty runs
            </label>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Form</TableHead>
                  <TableHead className="text-right">Fetched</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead className="text-right">Already had</TableHead>
                  <TableHead className="text-right">No contact</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      {/*
                        "Empty" has two very different causes here and they must
                        not look the same. Runs that found nothing are hidden by
                        default, so a perfectly healthy integration shows a blank
                        table — which reads as "polling is broken" to anyone who
                        did not tick the box themselves.
                      */}
                      {onlyInteresting && (stats?.runs ?? 0) > 0 ? (
                        <>
                          <div className="font-medium text-foreground">
                            {stats?.runs} run{stats?.runs === 1 ? "" : "s"}{" "}
                            completed, none found new leads.
                          </div>
                          <div className="mt-1">
                            That is the normal state between submissions. Untick{" "}
                            <strong>Hide empty runs</strong> to see them.
                          </div>
                        </>
                      ) : (
                        "Nothing recorded in this window."
                      )}
                    </TableCell>
                  </TableRow>
                )}

                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.accountName || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.formName || log.formId || "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {log.fetchedCount}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {log.newLeads}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {log.alreadyImported}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {log.skipped}
                    </TableCell>
                    <TableCell>
                      {log.status === "error" ? (
                        <span
                          className="text-xs text-rose-700"
                          title={log.error || undefined}
                        >
                          {log.error?.slice(0, 60) || "Error"}
                        </span>
                      ) : (
                        <Badge variant="outline" className="font-normal">
                          {log.status}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination meta={meta} onPageChange={setPage} onLimitChange={setLimit} />
        </CardContent>
      </Card>
    </div>
  );
};

export default MonitoringTab;
