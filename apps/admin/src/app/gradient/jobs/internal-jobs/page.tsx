"use client";
import { useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/gradient/components/DashboardLayout";
import { Button } from "@/gradient/components/ui/button";
import InternalJobs from "@/gradient/components/Pages/JobPage/InternalJobs/InternalJobs";

export default function Page() {
  return (
    <DashboardLayout
      title="Internal Jobs"
      actions={
        <div className="flex item-center gap-4">
          <Link href="/jobs">
            <Button size={"lg"} className="text-[12px] px-5">
              View All Jobs
            </Button>
          </Link>
          <Link href="/jobs/external-applications">
            <Button size={"lg"} className="text-[12px] px-5">
              View External Job Leads
            </Button>
          </Link>
        </div>
      }
    >
      <InternalJobs />
    </DashboardLayout>
  );
}
