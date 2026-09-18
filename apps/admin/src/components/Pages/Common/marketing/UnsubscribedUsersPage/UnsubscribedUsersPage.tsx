"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { campaignService } from "@/services/campaign/campaignService";
import { UnsubscribedUser } from "@/types/campaign";
import { useNotification } from "@/helpers/NotificationContext";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { HoverLoading } from "@/components/Common/Loading/HoverLoading";
import { format } from "date-fns";
import { exportUnsubscribedUsersToExcel } from "./DownloadAsExcel/DownloadAsExcel";

// Friendly labels for the `lead_source_type` enum coming back from the API.
// Mirrors LEAD_SOURCE_TYPE in tps-next-backend/constants/workflow.js.
const SOURCE_LABEL: Record<string, string> = {
  platform_leads: "Website lead",
  external_leads: "External lead",
  events: "Event registration",
  resources: "Resource download",
  users: "User signup",
};

type SourceFilter =
  | "all"
  | "platform_leads"
  | "external_leads"
  | "events"
  | "resources"
  | "users"
  | "email_only";

const FILTER_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "platform_leads", label: "Website leads" },
  { value: "events", label: "Event registrations" },
  { value: "resources", label: "Resource downloads" },
  { value: "users", label: "User signups" },
  { value: "external_leads", label: "External leads" },
  { value: "email_only", label: "Email only (campaign)" },
];

function describeSource(u: UnsubscribedUser): string {
  if (!u.lead_source_type) return "Email only";
  const label = SOURCE_LABEL[u.lead_source_type] || u.lead_source_type;
  return u.lead_source_id ? `${label} · ${u.lead_source_id}` : label;
}

export default function UnsubscribedUsersPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UnsubscribedUser[]>([]);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [selectedUser, setSelectedUser] = useState<UnsubscribedUser | null>(
    null,
  );
  const { showNotification } = useNotification();

  const filteredUsers = useMemo(() => {
    if (sourceFilter === "all") return users;
    if (sourceFilter === "email_only") {
      return users.filter((u) => !u.lead_source_type);
    }
    return users.filter((u) => u.lead_source_type === sourceFilter);
  }, [users, sourceFilter]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await campaignService.getUnsubscribedUsers();
      setUsers(response || []);
    } catch (error) {
      console.error("Failed to fetch unsubscribed users:", error);
      showNotification(
        "error",
        "Error",
        "Failed to load unsubscribed users list.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const truncateReason = (reason: string, wordLimit: number = 7) => {
    if (!reason) return "N/A";
    const words = reason.split(/\s+/);
    if (words.length <= wordLimit) return reason;
    return words.slice(0, wordLimit).join(" ") + "...";
  };

  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setDownloading(true);

      // Export whatever the current filter shows — same as on screen.
      exportUnsubscribedUsersToExcel(filteredUsers);
    } catch (error: any) {
      console.error(error);
      showNotification("error", "Error", error.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header section */}
      <div className="px-5 h-16 flex items-center justify-between border-b sticky top-0 bg-white z-10">
        {/* Left side */}
        <div className="flex items-center">
          <SidebarTrigger size={"lg"} />
          <h1 className="ml-4 text-lg font-semibold text-gray-800 py-4">
            Unsubscribed Users
          </h1>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <Select
            value={sourceFilter}
            onValueChange={(v) => setSourceFilter(v as SourceFilter)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={handleDownload}
            disabled={downloading || loading || filteredUsers.length === 0}
            className="px-4 py-2 cursor-pointer text-sm font-medium text-white bg-black rounded-md transition disabled:opacity-50 flex items-center gap-2"
          >
            {downloading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Download
              </>
            )}
          </button>
        </div>
      </div>

      <div className="p-5 overflow-auto">
        {loading ? (
          <HoverLoading title="Loading unsubscribe list..." />
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="font-semibold text-gray-700">
                    Email Address
                  </TableHead>
                  <TableHead className="font-semibold text-gray-700">
                    Reason
                  </TableHead>
                  <TableHead className="font-semibold text-gray-700">
                    Date
                  </TableHead>
                  <TableHead className="font-semibold text-gray-700">
                    Source
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <TableRow
                      key={user.id}
                      className="cursor-pointer hover:bg-gray-50/50 transition-colors"
                      onClick={() => setSelectedUser(user)}
                    >
                      <TableCell className="font-medium text-gray-900">
                        {user.email}
                      </TableCell>
                      <TableCell className="text-gray-600 max-w-xs truncate">
                        {truncateReason(user.reason)}
                      </TableCell>
                      <TableCell className="text-gray-500 whitespace-nowrap">
                        {user.createdAt
                          ? format(
                              new Date(user.createdAt),
                              "MMM d, yyyy HH:mm",
                            )
                          : "N/A"}
                      </TableCell>
                      <TableCell className="text-gray-600 text-xs">
                        {describeSource(user)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-10 text-gray-500"
                    >
                      {users.length === 0
                        ? "No unsubscribed users found."
                        : "No users match the current filter."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog
        open={!!selectedUser}
        onOpenChange={(open) => !open && setSelectedUser(null)}
      >
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Unsubscribe Reason</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm font-semibold text-gray-500">User Email</p>
              <p className="text-sm text-gray-900">{selectedUser?.email}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-500">Full Reason</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                {selectedUser?.reason || "No reason specified."}
              </p>
            </div>
            <div className="flex justify-between border-t pt-4 text-xs text-gray-400">
              <p>
                Date:{" "}
                {selectedUser?.createdAt
                  ? format(
                      new Date(selectedUser.createdAt),
                      "MMM d, yyyy HH:mm",
                    )
                  : "N/A"}
              </p>
              <p>Source: {selectedUser ? describeSource(selectedUser) : "—"}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
