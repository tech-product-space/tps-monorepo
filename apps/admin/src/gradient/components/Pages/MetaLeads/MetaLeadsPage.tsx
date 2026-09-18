"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Download, RotateCcw, Search, Tags } from "lucide-react";

import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent, CardHeader } from "@/gradient/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/gradient/components/ui/dropdown-menu";
import { Input } from "@/gradient/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import Pagination, {
  type IPaginationMeta,
} from "@/gradient/components/ui/custom/Pagination";
import { metaService } from "@/gradient/services/metaService";
import {
  META_LEAD_STATUS_LABELS,
  type MetaLead,
  type MetaLeadFilters,
  type MetaLeadStatus,
} from "@/gradient/types/meta";

import MetaLeadsTable from "./components/MetaLeadsTable";
import MetaLeadDetail from "./components/MetaLeadDetail";
import ManageSourcesDialog from "./components/ManageSourcesDialog";

const EMPTY_META: IPaginationMeta = {
  total: 0,
  page: 1,
  limit: 10,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

const EMPTY_FILTERS: MetaLeadFilters = {
  accounts: [],
  forms: [],
  campaigns: [],
  adsets: [],
  ads: [],
  sources: [],
};

const STATUS_OPTIONS: MetaLeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "rejected",
  "duplicate",
  "skipped",
];

/**
 * The flat `{source, subSource}` rows the API returns, folded into the two
 * levels the filter renders.
 *
 * The API groups by both columns at once, so one source with three sub sources
 * arrives as three rows — nesting them here keeps the request cheap and the
 * grouping in the one place that actually needs it.
 */
interface SourceGroup {
  source: string;
  displayName: string;
  subSources: { subSource: string; displayName: string }[];
}

type SortKey = "sourceCreatedAt" | "createdAt" | "name" | "status";

/** `ALL` rather than "" — Radix Select treats an empty string as no value. */
const ALL = "__all__";

/**
 * Hoisted, not declared inside the page.
 *
 * A component defined during render is a new type each time, so React remounts
 * it instead of updating it — and remounting a Radix Select closes its dropdown
 * the moment anything else on the page changes.
 */
const FilterSelect = ({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { id: string; name: string }[];
  placeholder: string;
}) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="w-[170px]">
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={ALL}>{placeholder}</SelectItem>
      {options.map((option) => (
        <SelectItem key={option.id} value={option.id}>
          {option.name}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

/**
 * Source and sub source, as chips rather than another dropdown.
 *
 * Matches Website Leads: source is the filter people reach for most, and a row
 * of chips shows what is available without a click. Sub sources hang off their
 * parent chip, so the pairing stays visible — a flat list of every sub source
 * would lose which source each belongs to.
 *
 * Hoisted for the same reason as FilterSelect: a component created during
 * render is a new type each pass, which closes an open menu on any re-render.
 */
const SourceChips = ({
  groups,
  source,
  subSource,
  onSelect,
}: {
  groups: SourceGroup[];
  source: string | null;
  subSource: string | null;
  onSelect: (source: string | null, subSource: string | null) => void;
}) => (
  <div className="flex flex-wrap gap-2">
    <Button
      size="sm"
      variant={source === null ? "default" : "outline"}
      onClick={() => onSelect(null, null)}
    >
      All sources
    </Button>

    {groups.map((group) => {
      const active = source === group.source;

      if (!group.subSources.length) {
        return (
          <Button
            key={group.source}
            size="sm"
            variant={active ? "default" : "outline"}
            onClick={() => onSelect(group.source, null)}
          >
            {group.displayName}
          </Button>
        );
      }

      const activeSub = active
        ? group.subSources.find((item) => item.subSource === subSource)
        : null;

      return (
        <DropdownMenu key={group.source}>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant={active ? "default" : "outline"}
              className="flex items-center gap-1"
            >
              {activeSub
                ? `${group.displayName} / ${activeSub.displayName}`
                : group.displayName}
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="min-w-48">
            <DropdownMenuItem onClick={() => onSelect(group.source, null)}>
              All {group.displayName}
            </DropdownMenuItem>

            {group.subSources.map((item) => (
              <DropdownMenuItem
                key={item.subSource}
                className="whitespace-nowrap"
                onClick={() => onSelect(group.source, item.subSource)}
              >
                {item.displayName}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    })}
  </div>
);

const MetaLeadsPage = () => {
  const [leads, setLeads] = useState<MetaLead[]>([]);
  const [meta, setMeta] = useState<IPaginationMeta>(EMPTY_META);
  const [filterOptions, setFilterOptions] = useState<MetaLeadFilters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<MetaLeadStatus | "all">("all");
  const [accountId, setAccountId] = useState(ALL);
  const [formId, setFormId] = useState(ALL);
  const [campaignId, setCampaignId] = useState(ALL);
  const [adsetId, setAdsetId] = useState(ALL);
  const [adId, setAdId] = useState(ALL);
  const [source, setSource] = useState<string | null>(null);
  const [subSource, setSubSource] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [sortBy, setSortBy] = useState<SortKey>("sourceCreatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [selected, setSelected] = useState<MetaLead | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  // Typing a name should not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);

    return () => clearTimeout(timer);
  }, [search]);

  const query = useMemo(
    () => ({
      page,
      limit,
      search: debouncedSearch || undefined,
      status: status === "all" ? undefined : status,
      accountId: accountId === ALL ? undefined : accountId,
      formId: formId === ALL ? undefined : formId,
      campaignId: campaignId === ALL ? undefined : campaignId,
      adsetId: adsetId === ALL ? undefined : adsetId,
      adId: adId === ALL ? undefined : adId,
      source: source || undefined,
      subSource: subSource || undefined,
      from: from || undefined,
      to: to || undefined,
      sortBy,
      sortDir,
    }),
    [
      page, limit, debouncedSearch, status, accountId, formId,
      campaignId, adsetId, adId, source, subSource, from, to, sortBy, sortDir,
    ],
  );

  const fetchLeads = useCallback(async () => {
    setLoading(true);

    try {
      const res = await metaService.listLeads(query);
      setLeads(res.data || []);
      setMeta(res.meta || EMPTY_META);
    } catch {
      toast.error("Could not load Facebook leads");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  /**
   * Cascading options: narrowing by account narrows the forms offered,
   * narrowing by campaign narrows the ad sets, and so on. Refetched whenever a
   * parent level changes so the child selects never offer something that would
   * resolve to nothing.
   */
  useEffect(() => {
    metaService
      .getFilters({
        accountId: accountId === ALL ? undefined : accountId,
        campaignId: campaignId === ALL ? undefined : campaignId,
        adsetId: adsetId === ALL ? undefined : adsetId,
      })
      .then((res) => setFilterOptions(res.data || EMPTY_FILTERS))
      .catch(() => {
        /* The filter bar degrades to free-text search; not worth a toast. */
      });
  }, [accountId, campaignId, adsetId]);

  /**
   * Built from the leads themselves, not the catalogue.
   *
   * A source that has been retired — or renamed since these leads arrived —
   * still needs to appear here, because leads carry a frozen copy of what they
   * were imported under. Listing the catalogue instead would silently hide
   * every lead attributed to something no longer offered.
   */
  const sourceGroups = useMemo<SourceGroup[]>(() => {
    const byKey = new Map<string, SourceGroup>();

    for (const row of filterOptions.sources) {
      if (!row.source) continue;

      if (!byKey.has(row.source)) {
        byKey.set(row.source, {
          source: row.source,
          displayName: row.sourceDisplayName || row.source,
          subSources: [],
        });
      }

      const group = byKey.get(row.source)!;

      if (
        row.subSource &&
        !group.subSources.some((item) => item.subSource === row.subSource)
      ) {
        group.subSources.push({
          subSource: row.subSource,
          displayName: row.subSourceDisplayName || row.subSource,
        });
      }
    }

    return [...byKey.values()].sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }, [filterOptions.sources]);

  const handleSort = (key: SortKey) => {
    if (key === sortBy) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortBy(key);
    setSortDir("desc");
  };

  const resetFilters = () => {
    setSearch("");
    setStatus("all");
    setAccountId(ALL);
    setFormId(ALL);
    setCampaignId(ALL);
    setAdsetId(ALL);
    setAdId(ALL);
    setSource(null);
    setSubSource(null);
    setFrom("");
    setTo("");
    setPage(1);
  };

  /**
   * The export needs the Authorization header, so it cannot be a plain link —
   * fetch the blob and save it from memory instead.
   */
  const handleExport = async () => {
    setExporting(true);

    try {
      const blob = await metaService.exportLeads(query);
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `meta-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();

      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not export these leads");
    } finally {
      setExporting(false);
    }
  };

  const hasFilters =
    search ||
    status !== "all" ||
    [accountId, formId, campaignId, adsetId, adId].some((v) => v !== ALL) ||
    source ||
    from ||
    to;

  /** Every filter change is a new result set, so it always returns to page 1. */
  const onFilterChange = (apply: (value: string) => void) => (value: string) => {
    apply(value);
    setPage(1);
  };

  return (
    <>
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email or phone"
                className="pl-9"
              />
            </div>

            {/*
              Lives here rather than in Facebook Setup on purpose: the taxonomy
              is lead work, and whoever is looking at leads is the person who
              notices a source is missing. Form mapping only picks from it.
            */}
            <Button variant="outline" onClick={() => setSourcesOpen(true)}>
              <Tags className="mr-2 h-4 w-4" />
              Manage sources
            </Button>

            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exporting || meta.total === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>

            {hasFilters && (
              <Button variant="ghost" onClick={resetFilters}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterSelect
              value={accountId}
              onChange={onFilterChange((value) => {
                setAccountId(value);
                // The form list is scoped to the account, so a stale form id
                // would silently filter everything out.
                setFormId(ALL);
              })}
              options={filterOptions.accounts}
              placeholder="All pages"
            />
            <FilterSelect
              value={formId}
              onChange={onFilterChange(setFormId)}
              options={filterOptions.forms}
              placeholder="All forms"
            />
            <FilterSelect
              value={campaignId}
              onChange={onFilterChange((value) => {
                setCampaignId(value);
                setAdsetId(ALL);
                setAdId(ALL);
              })}
              options={filterOptions.campaigns}
              placeholder="All campaigns"
            />
            <FilterSelect
              value={adsetId}
              onChange={onFilterChange((value) => {
                setAdsetId(value);
                setAdId(ALL);
              })}
              options={filterOptions.adsets}
              placeholder="All ad sets"
            />
            <FilterSelect
              value={adId}
              onChange={onFilterChange(setAdId)}
              options={filterOptions.ads}
              placeholder="All ads"
            />
            <FilterSelect
              value={status === "all" ? ALL : status}
              onChange={onFilterChange((value) =>
                setStatus(value === ALL ? "all" : (value as MetaLeadStatus)),
              )}
              options={STATUS_OPTIONS.map((option) => ({
                id: option,
                name: META_LEAD_STATUS_LABELS[option],
              }))}
              placeholder="All statuses"
            />

            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(1);
                }}
                className="w-[150px]"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(1);
                }}
                className="w-[150px]"
              />
            </div>
          </div>

          <SourceChips
            groups={sourceGroups}
            source={source}
            subSource={subSource}
            onSelect={(nextSource, nextSubSource) => {
              setSource(nextSource);
              setSubSource(nextSubSource);
              setPage(1);
            }}
          />
        </CardHeader>

        <CardContent className="p-0">
          <MetaLeadsTable
            leads={leads}
            loading={loading}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
            onSelect={setSelected}
          />

          <Pagination
            meta={meta}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        </CardContent>
      </Card>

      <ManageSourcesDialog
        open={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        // Source labels appear in the filter bar, so a rename or a retire has
        // to be reflected without a page reload.
        onChanged={fetchLeads}
      />

      <MetaLeadDetail
        lead={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        onStatusChanged={(id, next) =>
          setLeads((prev) =>
            prev.map((lead) => (lead.id === id ? { ...lead, status: next } : lead)),
          )
        }
      />
    </>
  );
};

export default MetaLeadsPage;
