"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAdminToken } from "@/gradient/lib/storage";
import { Loader2 } from "lucide-react";

export default function LoginGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAdminToken();

    if (token) {
      router.replace("/");
    } else {
      setLoading(false);
    }
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}