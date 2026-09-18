"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { Badge } from "@/gradient/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import { Button } from "@/gradient/components/ui/button";
import { Edit, Eye, Loader2, RefreshCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ResourceResponse } from "@/gradient/types/resource";
import { resourceService } from "@/gradient/services/resourceService";
import { ToggleResourceStatus } from "./ToggleResourceStatus";
import { useRouter } from "next/navigation";

interface ResourceTableProps {
  resources: ResourceResponse[];
  fetchResources: () => void;
  fetchLoading: boolean;
}

export default function ResourceTable({
  resources,
  fetchResources,
  fetchLoading,
}: ResourceTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const router = useRouter();

  const handleManage = (id: string) => {
    router.push(`/resources/manage/${id}`);
  };

  const handleEdit = (id: string) => {
    router.push(`/resources/${id}`);
  };

  const handleDelete = (resource: ResourceResponse) => {
    toast(`Delete "${resource.title}"?`, {
      description: "This action cannot be undone.",
      duration: 8000,
      action: {
        label: "Delete",
        onClick: () => confirmDelete(resource.id),
      },
      cancel: {
        label: "Cancel",
        onClick: () => {},
      },
    });
  };

  const confirmDelete = async (id: string) => {
    setDeletingId(id);
    const toastId = toast.loading("Deleting resource...");
    try {
      await resourceService.deleteResource(id);
      toast.success("Resource deleted successfully!", { id: toastId });
      fetchResources();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to delete resource.",
        { id: toastId },
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>All Resources</CardTitle>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchResources}
          disabled={fetchLoading}
        >
          <RefreshCcw
            className={`w-4 h-4 ${fetchLoading ? "animate-spin" : ""}`}
          />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fetchLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading resources...
                    </div>
                  </TableCell>
                </TableRow>
              ) : resources.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No resources found.
                  </TableCell>
                </TableRow>
              ) : (
                resources.map((resource) => (
                  <TableRow key={resource.id}>
                    <TableCell className="font-medium">
                      <div>
                        <p>{resource.title}</p>
                        <p className="text-xs text-muted-foreground font-normal truncate max-w-[300px]">
                          {resource.resourceSlug}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {resource.resourceType || "N/A"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {resource.resourceCategory || "N/A"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(resource.createdAt || "").toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <ToggleResourceStatus
                        resourceId={resource.id}
                        isPublished={resource.isPublished}
                        refetch={fetchResources}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-primary"
                        onClick={() => handleManage(resource.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-primary"
                        onClick={() => handleEdit(resource.id)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={deletingId === resource.id}
                        onClick={() => handleDelete(resource)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        {deletingId === resource.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
