"use client";

import { useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/gradient/components/DashboardLayout";
import JobPage from "@/gradient/components/Pages/JobPage/JobPage";
import { Button } from "@/gradient/components/ui/button";

export default function Page() {
  const [search, setSearch] = useState<string>("");

  return (
    <DashboardLayout
      title="Jobs"
      actions={
        <div className="flex item-center gap-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search by Job ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm w-64 focus:outline-none"
            />
          </div>

          <Link href="/jobs/add-job">
            <Button size={"lg"} className="text-[12px] px-5">
              Add Job
            </Button>
          </Link>
          <Link href="/jobs/internal-jobs">
            <Button size={"lg"} className="text-[12px] px-5">
              View Internal Jobs
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
      <JobPage search={search} />
    </DashboardLayout>
  );
}
