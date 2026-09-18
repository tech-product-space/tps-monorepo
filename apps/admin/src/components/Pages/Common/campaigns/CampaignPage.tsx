"use client";

import { useEffect, useState } from "react";
import { Campaign } from "@/types/campaign";
import { useRouter } from "next/navigation";

import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";

import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

import { Input } from "@/components/ui/input";
import { campaignService } from "@/services/campaign/campaignService";
import { Card, CardContent } from "@/components/ui/card";

import { Loader2, Pencil, Trash2 } from "lucide-react";
import { formatDataTime } from "@/utils/formatDataTime";
import { StatusBadge } from "./CampaignEditPage/CampaignEditPage";

const CampaignPage = () => {
  const router = useRouter();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await campaignService.getCampaigns();
      setCampaigns(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const handleCreate = async () => {
    if (!name) return;

    try {
      setCreating(true);

      const campaign = await campaignService.createCampaign({
        name,
        type: "email",
      });

      router.push(`campaigns/${campaign.id}/edit`);
    } catch (err) {
      console.error(err);
      setError("Failed to create campaign");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await campaignService.deleteCampaign(id);

      setCampaigns((prev) => prev.filter((campaign) => campaign.id !== id));
    } catch (err) {
      console.error(err);
      setError("Failed to delete campaign");
    }
  };

  return (
    <div className="space-y-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex px-8 py-5 items-center justify-between">
        <h1 className="border-b text-2xl font-semibold">Campaigns</h1>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Create Campaign</Button>
          </DialogTrigger>

          <DialogContent className="w-full max-w-xl">
            <DialogHeader>
              <DialogTitle>Create Campaign</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <Input
                placeholder="Campaign name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <div className="text-sm text-muted-foreground">Type: Email</div>
            </div>

            <DialogFooter>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Campaign Table */}
      <Card className="mx-8">
        <CardContent className="p-0">
          {/* Loading */}
          {loading && (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="text-center py-16 text-destructive">
              {error}

              <div className="mt-4">
                <Button variant="outline" onClick={fetchCampaigns}>
                  Retry
                </Button>
              </div>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && campaigns.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              No campaigns created yet
            </div>
          )}

          {/* Table */}
          {!loading && !error && campaigns.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id} className="hover:bg-muted/40">
                    <TableCell>{campaign.name}</TableCell>

                    <TableCell>{campaign.type}</TableCell>

                    <TableCell className="capitalize">
                      <StatusBadge status={campaign.status} />
                    </TableCell>

                    <TableCell>{formatDataTime(campaign.createdAt)}</TableCell>

                    <TableCell className="flex gap-2">
                      {/* Edit */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          router.push(`campaigns/${campaign.id}/edit`)
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>

                      {/* Delete */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>

                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>

                            <AlertDialogDescription>
                              This action cannot be undone. This will
                              permanently delete the campaign.
                            </AlertDialogDescription>
                          </AlertDialogHeader>

                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>

                            <AlertDialogAction
                              onClick={() => handleDelete(campaign.id)}
                              className="bg-destructive text-white hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CampaignPage;
