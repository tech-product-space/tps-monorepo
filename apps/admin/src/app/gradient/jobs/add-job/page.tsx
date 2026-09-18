"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import { Button } from "@/gradient/components/ui/button";
import { jobService } from "@/gradient/services/jobService";
import { CreateJobPayload } from "@/gradient/types/job";
import JobForm, { JobFormValues } from "@/gradient/components/Pages/JobPage/JobForm";

export default function AddJobPage() {
  const router = useRouter();

  const onSubmit = async (values: JobFormValues) => {
    try {
      await jobService.createJob(values as CreateJobPayload);
      toast.success("Job created successfully");
      router.push("/jobs");
      router.refresh();
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "Failed to create job");
    }
  };

  return (
    <DashboardLayout title="Add New Job">
      <div className="w-full mx-auto space-y-6 pb-10">
        <JobForm
          onSubmit={onSubmit}
          onCancel={() => router.back()}
          submitLabel="Create Job"
          loadingLabel="Creating..."
        />
      </div>
    </DashboardLayout>
  );
}
