"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import Pagination from "@/gradient/components/ui/custom/Pagination";

import { campaignService } from "@/gradient/services/campaignService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import type { Campaign, CampaignStatus } from "@/gradient/types/campaign";
import type { IPaginationMeta } from "@/gradient/types/pagination";

import CampaignTable from "./CampaignTable";

const STATUS_FILTERS: { label: string; value: CampaignStatus | null }[] = [
  { label: "All", value: null },
  { label: "Draft", value: "draft" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Sending", value: "processing" },
  { label: "Sent", value: "sent" },
  { label: "Failed", value: "failed" },
];

/**
 * The campaigns list. Rendered by `/marketing/campaigns`.
 *
 * Marketing is a sidebar group rather than a page: Campaigns and Contacts are
 * separate routes, so each keeps its own URL, back button and page title.
 */
export default function CampaignsTab() {
  const router = useRouter();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [status, setStatus] = useState<CampaignStatus | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<IPaginationMeta>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await campaignService.list({ status, page, limit });
      setCampaigns(res.data || []);
      if (res.meta) setMeta(res.meta);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load campaigns"));
    } finally {
      setLoading(false);
    }
  }, [status, page, limit]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const handleCreate = async () => {
    if (!name.trim()) return;

    setCreating(true);
    try {
      const campaign = await campaignService.create(name.trim());
      // Straight into the editor — a campaign with only a name is not
      // something anyone wants to look at in a list.
      router.push(`/marketing/campaigns/${campaign.id}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to create campaign"));
      setCreating(false);
    }
  };

  const handleDuplicate = async (campaign: Campaign) => {
    try {
      const copy = await campaignService.duplicate(campaign.id);
      toast.success(`Copied to "${copy.name}"`);
      // Into the copy, not back to the list: duplicating is the first step of
      // editing something, never the last step of anything.
      router.push(`/marketing/campaigns/${copy.id}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to duplicate the campaign"));
    }
  };

  const handleDelete = async (campaign: Campaign) => {
    try {
      await campaignService.remove(campaign.id);
      toast.success(`"${campaign.name}" deleted`);
      fetchCampaigns();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to delete campaign"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.label}
              variant={status === filter.value ? "default" : "outline"}
              onClick={() => {
                setStatus(filter.value);
                setPage(1);
              }}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        <Button
          onClick={() => {
            setName("");
            setCreateOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          New campaign
        </Button>
      </div>

      <div className="rounded-md border">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        ) : (
          <CampaignTable
            campaigns={campaigns}
            onOpen={(c) => router.push(`/marketing/campaigns/${c.id}`)}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
          />
        )}
      </div>

      <Pagination meta={meta} onPageChange={setPage} onLimitChange={setLimit} />

      <Dialog
        open={createOpen}
        onOpenChange={(open) => !creating && setCreateOpen(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New campaign</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Input
              autoFocus
              placeholder="e.g. August AI cohort — last call"
              value={name}
              disabled={creating}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <p className="text-muted-foreground text-xs">
              An internal name. Recipients never see it — the subject line comes
              next.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
