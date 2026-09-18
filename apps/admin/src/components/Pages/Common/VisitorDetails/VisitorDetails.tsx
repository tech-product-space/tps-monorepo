"use client";

import {
  getVisitorDetails,
  getVisitorContacts,
  blockVisitor,
  unblockVisitor,
} from "@/services/visitorTracking/visitorTracking";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  User,
  Globe,
  Clock,
  Shield,
  Mail,
  FileText,
  Calendar,
  ArrowLeft,
  Ban,
  CheckCircle,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseUserAgent } from "@/utils/parseUserAgent";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDataTime } from "@/utils/formatDataTime";

export default function VisitorDetails() {
  const pathname = usePathname();
  const router = useRouter();
  const visitorId = pathname.split("/").pop();

  const [visitor, setVisitor] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchVisitor = async (id: string) => {
    try {
      const response = await getVisitorDetails(id);
      setVisitor(response.data);
    } catch (error) {
      console.error("Failed to fetch visitor:", error);
    }
  };

  const fetchContacts = async (id: string) => {
    try {
      const response = await getVisitorContacts(id);
      setContacts(response.data);
    } catch (error) {
      console.error("Failed to fetch contacts:", error);
    }
  };

  const handleBlockUnblock = async () => {
    if (!visitorId) return;

    setActionLoading(true);
    try {
      if (visitor.isBlocked) {
        await unblockVisitor(visitorId);
      } else {
        if (!blockReason.trim()) {
          alert("Please provide a blocking reason");
          setActionLoading(false);
          return;
        }
        await blockVisitor(visitorId, blockReason);
      }

      // Refresh visitor data
      await fetchVisitor(visitorId);
      setDialogOpen(false);
      setBlockReason("");
    } catch (error) {
      console.error("Failed to update visitor status:", error);
      alert("Failed to update visitor status. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (visitorId) {
      Promise.all([fetchVisitor(visitorId), fetchContacts(visitorId)]).then(
        () => setLoading(false)
      );
    }
  }, [visitorId]);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="px-6 h-16 flex items-center justify-between border-b bg-white shadow-sm">
        <div className="flex items-center gap-4">
          <ArrowLeft
            className="h-5 w-5 cursor-pointer hover:text-gray-700 transition-colors"
            onClick={() => router.back()}
          />
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                Visitor Details
              </h1>
              <p className="text-xs text-gray-500">
                Complete visitor information and activity
              </p>
            </div>
          </div>
        </div>

        {/* Block/Unblock Button */}
        {!loading && visitor && (
          <Button
            onClick={() => setDialogOpen(true)}
            variant={visitor.isBlocked ? "outline" : "destructive"}
            className={
              visitor.isBlocked
                ? "border-green-600 text-green-600 hover:bg-green-50"
                : ""
            }
          >
            {visitor.isBlocked ? (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Unblock Visitor
              </>
            ) : (
              <>
                <Ban className="w-4 h-4 mr-2" />
                Block Visitor
              </>
            )}
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="w-12 h-12 border-4  border-t-black rounded-full animate-spin mx-auto mb-4"></div>
              </div>
            </div>
          ) : !visitor ? (
            <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Visitor Not Found
              </h3>
              <p className="text-gray-500">
                The requested visitor could not be found in the system.
              </p>
            </div>
          ) : (
            <>
              {/* Status Banner */}
              {visitor.isBlocked && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <Shield className="w-5 h-5 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-red-900">
                      Visitor Blocked
                    </h3>
                    <p className="text-sm text-red-700 mt-1">
                      Reason: {visitor.blockingReason || "No reason specified"}
                    </p>
                  </div>
                </div>
              )}

              {/* Visitor Information Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Basic Information */}
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <User className="w-5 h-5 text-gray-700" />
                    <h2 className="text-base font-semibold text-gray-900">
                      Basic Information
                    </h2>
                  </div>
                  <div className="space-y-4">
                    <InfoItem label="Visitor ID" value={visitor.id} mono />
                    <InfoItem
                      label="Status"
                      value={
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                            visitor.isBlocked
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {visitor.isBlocked ? "Blocked" : "Active"}
                        </span>
                      }
                    />
                  </div>
                </div>

                {/* Activity Timestamps */}
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <Clock className="w-5 h-5 text-gray-700" />
                    <h2 className="text-base font-semibold text-gray-900">
                      Activity Timeline
                    </h2>
                  </div>
                  <div className="space-y-4">
                    <InfoItem
                      label="First Seen"
                      value={formatDataTime(visitor.firstSeen)}
                      icon={<Calendar className="w-4 h-4 text-gray-400" />}
                    />
                    <InfoItem
                      label="Last Seen"
                      value={formatDataTime(visitor.lastSeen)}
                      icon={<Calendar className="w-4 h-4 text-gray-400" />}
                    />
                    <InfoItem
                      label="Notified"
                      value={
                        visitor.notifiedAt
                          ? formatDataTime(visitor.notifiedAt)
                          : "Never"
                      }
                      icon={<Calendar className="w-4 h-4 text-gray-400" />}
                    />
                  </div>
                </div>

                {/* Browser & Location */}
                <div className="bg-white rounded-xl shadow-sm border p-6 lg:col-span-2">
                  <div className="flex items-center gap-2 mb-5">
                    <Globe className="w-5 h-5 text-gray-700" />
                    <h2 className="text-base font-semibold text-gray-900">
                      Browser & Activity
                    </h2>
                  </div>
                  <div className="space-y-4">
                    <InfoItem
                      label="User Agent"
                      value={parseUserAgent(visitor.userAgent)}
                      wrap
                    />
                    <InfoItem
                      label="Last Visited URL"
                      value={
                        "https://theproductspace.in" + visitor.lastVisitedUrl
                      }
                      link
                    />
                  </div>
                </div>
              </div>

              {/* Contact Submissions */}
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-6 border-b bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="w-5 h-5 text-gray-700" />
                      <h2 className="text-base font-semibold text-gray-900">
                        Contact Submissions
                      </h2>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  {contacts.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <FileText className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-gray-500 text-sm">
                        No contact submissions found for this visitor.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50">
                            <TableHead className="font-semibold">
                              Name
                            </TableHead>
                            <TableHead className="font-semibold">
                              Email
                            </TableHead>
                            <TableHead className="font-semibold">
                              Phone
                            </TableHead>
                            <TableHead className="font-semibold">
                              Source
                            </TableHead>
                            <TableHead className="font-semibold">
                              Submitted
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {contacts.map((c) => (
                            <TableRow key={c.id} className="hover:bg-gray-50">
                              <TableCell className="font-medium">
                                {c.name}
                              </TableCell>
                              <TableCell>
                                <a
                                  href={`mailto:${c.email}`}
                                  className="text-blue-600 hover:underline"
                                >
                                  {c.email}
                                </a>
                              </TableCell>
                              <TableCell>{c.phone || "—"}</TableCell>
                              <TableCell className="max-w-xs">
                                <div
                                  className="truncate text-sm text-gray-600"
                                  title={c.source}
                                >
                                  {c.source}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-gray-600">
                                {formatDataTime(c.createdAt)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Block/Unblock Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px] p-6">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <DialogTitle className="text-xl font-semibold">
                {visitor?.isBlocked ? "Unblock Visitor" : "Block Visitor"}
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-5">
            {/* Current Blocking Reason */}
            {visitor?.isBlocked && visitor?.blockingReason && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-900">
                    Current blocking reason
                  </p>
                  <p className="text-amber-700 mt-1">
                    {visitor.blockingReason}
                  </p>
                </div>
              </div>
            )}

            {/* Block Reason Input */}
            {!visitor?.isBlocked && (
              <div className="space-y-2">
                <label
                  htmlFor="blockReason"
                  className="text-sm font-medium text-gray-700"
                >
                  Blocking Reason <span className="text-red-500">*</span>
                </label>

                <Textarea
                  id="blockReason"
                  placeholder="Enter the reason for blocking this visitor..."
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  rows={4}
                  className="resize-none rounded-md max-h-[300px]"
                />

                <p className="text-xs text-gray-500">
                  This reason will be stored and shown to administrators.
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                setBlockReason("");
              }}
              disabled={actionLoading}
            >
              Cancel
            </Button>

            <Button
              onClick={handleBlockUnblock}
              disabled={
                actionLoading || (!visitor?.isBlocked && !blockReason.trim())
              }
              variant={visitor?.isBlocked ? "default" : "destructive"}
              className={
                visitor?.isBlocked
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : ""
              }
            >
              {actionLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Processing...
                </>
              ) : visitor?.isBlocked ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Unblock Visitor
                </>
              ) : (
                <>
                  <Ban className="w-4 h-4 mr-2" />
                  Block Visitor
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoItem({
  label,
  value,
  icon,
  mono,
  wrap,
  link,
}: {
  label: string;
  value: any;
  icon?: React.ReactNode;
  mono?: boolean;
  wrap?: boolean;
  link?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <span className="text-sm font-medium text-gray-500 whitespace-nowrap">
          {label}
        </span>
      </div>
      <div
        className={`text-sm text-gray-900 text-right ${
          mono ? "font-mono" : ""
        } ${wrap ? "break-words max-w-md" : ""}`}
      >
        {link ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline break-all"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </div>
    </div>
  );
}
