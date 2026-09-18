"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import DashboardLayout from "@/gradient/components/DashboardLayout";
import { ResourceDetailPage } from "./ResourceDetailPage/ResourceDetailPage";
import { resourceService } from "@/gradient/services/resourceService";
import { ResourceResponse } from "@/gradient/types/resource";

export default function ResourceEditor({ resourceId }: { resourceId: string }) {
  const [resource, setResource] = useState<ResourceResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadResource = async () => {
      try {
        const response = await resourceService.getResourceById(resourceId);
        const resourceData = response?.data || response;
        setResource(resourceData);
      } catch (error) {
        console.error("Error loading resource:", error);
      } finally {
        setLoading(false);
      }
    };

    loadResource();
  }, [resourceId]);

  if (loading) {
    return (
      <DashboardLayout title="Resource Edit">
        <div className="flex items-center justify-center p-20">
          <Loader2 className="animate-spin h-6 w-6" />
        </div>
      </DashboardLayout>
    );
  }

  if (!resource) {
    return (
      <DashboardLayout title="Resource Edit">
        <div className="p-6 text-center">
          <h2 className="text-xl font-semibold">Resource not found</h2>
          <p className="text-muted-foreground">
            The requested resource could not be retrieved.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Resource Edit">
      <ResourceDetailPage resource={resource} />
    </DashboardLayout>
  );
}
