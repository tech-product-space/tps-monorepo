"use client";

import Sidebar from "@/gradient/components/Sidebar";
import Topbar from "@/gradient/components/Topbar";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/gradient/context/AuthContext";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function DashboardLayout({
  children,
  title,
  actions,
}: {
  children: React.ReactNode;
  title?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const { admin, loading, logout } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    // Initialize
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!loading) {
      if (!admin) {
        router.replace("/auth/login");
      } else if (!admin.isActive) {
        logout();
      }
    }
  }, [admin, loading, router, logout]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8F8F8]">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!admin) return null;

  return (
    <div className="flex h-screen bg-base relative overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
        fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}
      >
        <Sidebar
          onClose={() => {
            if (window.innerWidth < 768) setSidebarOpen(false);
          }}
        />
      </div>

      {/* Main content area */}
      <div
        className={`flex-1 flex flex-col min-h-screen w-full transition-all duration-300 ease-in-out ${sidebarOpen ? "md:ml-60" : "ml-0"}`}
      >
        <Topbar
          title={title}
          actions={actions}
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
          isSidebarOpen={sidebarOpen}
        />
        <main className="flex-1 bg-[#F8F8F8] p-6 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
