"use client";

import { useState, useEffect, useCallback } from "react";
import { useResourceStore } from "@/gradient/lib/store/useResourceStore";
import { resourceService } from "@/gradient/services/resourceService";
import { ResourceResponse } from "@/gradient/types/resource";
import AddResource from "./AddResource/AddResource";
import { toast } from "sonner";
import ResourceTable from "./ResourceTable";

export default function ResourcePage() {
  const { showCreateForm } = useResourceStore();
  const [resources, setResources] = useState<ResourceResponse[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);

  const fetchResources = useCallback(async () => {
    setFetchLoading(true);
    try {
      const data = await resourceService.getAllResources();
      if (data.success) {
        setResources(data.data);
      } else {
        toast.error(data.message || "Failed to fetch resources");
      }
    } catch (error: any) {
      console.error("Error fetching resources:", error);
      toast.error(error.response?.data?.message || "Error fetching resources");
    } finally {
      setFetchLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  return (
    <div className="space-y-8">
      {showCreateForm && <AddResource onSuccess={fetchResources} />}
      <ResourceTable
        resources={resources}
        fetchResources={fetchResources}
        fetchLoading={fetchLoading}
      />
    </div>
  );
}
