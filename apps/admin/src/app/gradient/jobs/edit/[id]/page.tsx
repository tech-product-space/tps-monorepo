"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import { Button } from "@/gradient/components/ui/button";
import { jobService } from "@/gradient/services/jobService";
import { CreateJobPayload, Job } from "@/gradient/types/job";
import JobForm, { JobFormValues } from "@/gradient/components/Pages/JobPage/JobForm";

interface EditJobPageProps {
  params: Promise<{ id: string }>;
}

export default function EditJobPage({ params }: EditJobPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchJob = async () => {
      try {
        const res = await jobService.getJobById(id);
        setJob(res.data);
      } catch (error) {
        console.error(error);
        toast.error("Failed to fetch job details");
        router.push("/jobs");
      } finally {
        setIsLoading(false);
      }
    };

    fetchJob();
  }, [id, router]);

  const onSubmit = async (values: JobFormValues) => {
    try {
      await jobService.updateJob(id, values as CreateJobPayload);
      toast.success("Job updated successfully");
      router.push("/jobs");
      router.refresh();
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "Failed to update job");
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout title="Edit Job">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </DashboardLayout>
    );
  }

  if (!job) return null;

  return (
    <DashboardLayout title={`Edit Job: ${job.title}`}>
      <div className="w-full mx-auto space-y-6 pb-10">
        <JobForm
          initialValues={{
            jobType: job.jobType,
            title: job.title,
            location: job.location,
            descriptionHtml: job.descriptionHtml || "",
            employmentType: job.employmentType as any,
            seniorityLevel: job.seniorityLevel,
            companyName: job.companyName,
            companyLogo: job.companyLogo || "",
            companyDescription: job.companyDescription || "",
            companyWebsite: job.companyWebsite || "",
          }}
          onSubmit={onSubmit}
          onCancel={() => router.back()}
          submitLabel="Update Job"
          loadingLabel="Updating..."
        />
      </div>
    </DashboardLayout>
  );
}
