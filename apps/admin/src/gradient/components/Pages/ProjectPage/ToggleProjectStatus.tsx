"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/gradient/components/ui/switch";
import { projectService } from "@/gradient/services/projectService";

interface Props {
  id: string;
  isPublished: boolean;
  onChanged: () => void;
}

/**
 * Publish / unpublish.
 *
 * The backend refuses to publish a project that is unapproved, has no valid
 * download link, has no category, or has no published guide step — each with
 * its own message. **Those messages are the whole value of this control**, so
 * they are surfaced verbatim rather than collapsed into "Failed to update":
 * "Publish at least one guide step" tells an admin what to do next, and a
 * generic failure sends them to look at the console.
 */
export function ToggleProjectStatus({ id, isPublished, onChanged }: Props) {
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      const data = await projectService.toggleProjectStatus(id);

      if (data.success) {
        toast.success(
          data.isPublished ? "Project published" : "Project unpublished",
        );
        onChanged();
      } else {
        toast.error(data.message || "Could not change the status");
      }
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Could not change the status",
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  return (
    <Switch
      checked={isPublished}
      onCheckedChange={handleToggle}
      aria-label={isPublished ? "Unpublish project" : "Publish project"}
    />
  );
}
