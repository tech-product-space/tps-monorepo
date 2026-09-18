"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNotification } from "@/helpers/NotificationContext";
import {
  approveCertificate,
  generateCertificate,
} from "@/services/Events/certificateService";
import { IEventFeedback } from "@/services/Events/eventFeedbackService";
import { Award, Eye, CheckCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import WorkshopResponseDialog from "./dialogs/WorkshopResponseDialog";
import HackathonDialog from "./dialogs/HackathonDialog";

interface EventResponseTableProps {
  responses: IEventFeedback[];
  type?: "feedback" | "submission";
  eventType: string;
  onUpdate?: (item: IEventFeedback) => void;
}

interface TeamMemberDisplay {
  name: string;
  email: string;
  phone: string;
  profilePicture?: string | null;
  certificateApproved: boolean;
  certificateGenerated: boolean;
  certificateGeneratedAt?: string | null;
  certificateId?: string | null;
  userId: number;
  guestId: number;
}

const EventResponseTable = ({
  responses,
  type = "feedback",
  eventType,
  onUpdate,
}: EventResponseTableProps) => {
  const { showNotification } = useNotification();

  const [selectedResponse, setSelectedResponse] =
    useState<IEventFeedback | null>(null);
  const [isWorkshopDialogOpen, setIsWorkshopDialogOpen] = useState(false);
  const [isHackathonDialogOpen, setIsHackathonDialogOpen] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(
    null,
  );
  const [approving, setApproving] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // For team member approval/certificate
  const [teamMemberApproving, setTeamMemberApproving] = useState<string | null>(null);
  const [pendingTeamMemberApproval, setPendingTeamMemberApproval] = useState<{
    userId: string;
    eventId: string;
    guestId: string;
    name: string;
  } | null>(null);

  const isSubmission = type === "submission";

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatKey = (key: string) => {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  const isValidUrl = (value: string) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  };

  // Get team members from the teamMembers array in the API response
  const getTeamMembers = (item: IEventFeedback): TeamMemberDisplay[] => {
    if (!item.teamMembers || item.teamMembers.length === 0) {
      return [];
    }

    return item.teamMembers.map(member => ({
      name: member.guest?.name || member.user?.name || "Unknown",
      email: member.user?.email || "",
      phone: member.guest?.phone || "",
      profilePicture: member.user?.profile_picture,
      certificateApproved: member.guest?.certificateApproved || false,
      certificateGenerated: member.guest?.certificateGenerated || false,
      certificateGeneratedAt: member.guest?.certificateGeneratedAt || null,
      certificateId: member.guest?.certificateId || null,
      userId: member.user?.id || 0,
      guestId: member.guest?.id || 0,
    }));
  };

  const toggleRowExpansion = (id: number) => {
    const newExpandedRows = new Set(expandedRows);
    if (newExpandedRows.has(id)) {
      newExpandedRows.delete(id);
    } else {
      newExpandedRows.add(id);
    }
    setExpandedRows(newExpandedRows);
  };

  const handleViewWorkshopResponse = (response: IEventFeedback) => {
    setSelectedResponse(response);
    setIsWorkshopDialogOpen(true);
  };

  const handleHackathonResponse = (response: IEventFeedback) => {
    setSelectedResponse(response);
    setIsHackathonDialogOpen(true);
  };

  const handleViewResponse = (response: IEventFeedback) => {
    const eventType = response.event.eventType?.toLowerCase();

    if (eventType === "workshop") {
      handleViewWorkshopResponse(response);
      return;
    }

    if (
      eventType === "hackathon" ||
      eventType === "teardown" ||
      eventType === "hackathon/teardown"
    ) {
      handleHackathonResponse(response);
      return;
    }

    handleViewWorkshopResponse(response);
  };

  const openConfirmDialog = (responseId: string) => {
    setPendingApprovalId(responseId);
    setIsConfirmDialogOpen(true);
  };

  const openTeamMemberApprovalDialog = (userId: number, eventId: number, guestId: number, name: string) => {
    setPendingTeamMemberApproval({
      userId: userId.toString(),
      eventId: eventId.toString(),
      guestId: guestId.toString(),
      name
    });
  };
  const handleApproveSubmission = async () => {
    if (!pendingApprovalId) return;

    try {
      setApproving(pendingApprovalId);
      setIsConfirmDialogOpen(false);

      const updatedItem = responses.find(
        (item) => item.id.toString() === pendingApprovalId,
      );

      if (!updatedItem) {
        throw new Error("Item not found");
      }

      // Approve certificate first
      await approveCertificate(pendingApprovalId);

      // Then generate certificate
      const certificateResponse = await generateCertificate({
        userId: updatedItem.user.id.toString(),
        eventId: updatedItem.event.id.toString(),
      });

      if (onUpdate) {
        onUpdate({
          ...updatedItem,
          certificateApproved: true,
          ...certificateResponse,
        });
      }

      showNotification("success", "Success", "Certificate approved and generated successfully");
    } catch (error) {
      console.error(
        "Failed to approve submission and generate certificate:",
        error,
      );
      showNotification(
        "error",
        "Failed to approve submission and generate certificate",
        "Please try again.",
      );
    } finally {
      setApproving(null);
      setPendingApprovalId(null);
    }
  };

  const handleApproveTeamMember = async () => {
    if (!pendingTeamMemberApproval) return;

    try {
      setTeamMemberApproving(pendingTeamMemberApproval.guestId);

      // Approve certificate first
      await approveCertificate(pendingTeamMemberApproval.guestId);

      // Then generate certificate
      const certificateResponse = await generateCertificate({
        userId: pendingTeamMemberApproval.userId,
        eventId: pendingTeamMemberApproval.eventId,
      });

      showNotification("success", "Success", "Team member approved and certificate generated successfully");


      // Trigger a refresh if needed
      if (onUpdate) {
        const eventFeedback = responses.find(
          r => r.event.id.toString() === pendingTeamMemberApproval.eventId
        );

        if (eventFeedback && eventFeedback.teamMembers) {
          const updatedItem: IEventFeedback = {
            ...eventFeedback,
            teamMembers: eventFeedback.teamMembers.map(member => {
              if (member.guest?.id.toString() === pendingTeamMemberApproval.guestId) {
                return {
                  ...member,
                  guest: {
                    ...member.guest!,
                    certificateApproved: true,
                    certificateGenerated: true,
                    certificateGeneratedAt: new Date().toISOString(),
                     ...(certificateResponse as any),
                  },
                };
              }
              return member;
            }),
          };

          onUpdate(updatedItem);
        }
      }
      setPendingTeamMemberApproval(null);
    } catch (error) {
      console.error("Failed to approve team member and generate certificate:", error);
      showNotification("error", "Failed to approve and generate certificate", "Please try again.");
    } finally {
      setTeamMemberApproving(null);
    }
  };
  const cancelApproval = () => {
    setIsConfirmDialogOpen(false);
    setPendingApprovalId(null);
  };

  const getPendingApprovalItem = () => {
    return responses.find((item) => item.id.toString() === pendingApprovalId);
  };

  return (
    <>
      <div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>
                {isSubmission ? "Submission Date" : "Feedback Submitted At"}
              </TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {responses.map((item) => {
              const name = item.name || item.user.name;
              const phone = item.phone || item.user.phone;
              const isApproved = item.certificateApproved || false;
              const isCertificateGenerated = item.certificateGenerated || false;
              const teamMembers = getTeamMembers(item);
              const hasTeamMembers = teamMembers.length > 0;
              const isExpanded = expandedRows.has(item.id);

              return (
                <>
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10">
                          <AvatarImage
                            src={item.user.profile_picture || "/placeholder.svg"}
                          />
                          <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                            {name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900 capitalize">
                              {name}
                            </p>
                          </div>
                          <p className="text-sm text-gray-500">
                            {item.user.email}
                          </p>
                          {phone && (
                            <p className="text-sm text-gray-500">{phone}</p>
                          )}
                          {hasTeamMembers && (
                            <button
                              onClick={() => toggleRowExpansion(item.id)}
                              className="text-xs text-blue-600 hover:text-blue-800 mt-1 flex items-center gap-1"
                            >
                              {isExpanded ? "Hide" : "Show"} Team Members ({teamMembers.length})
                            </button>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-gray-700">
                        {formatDate(item.feedbackSubmittedAt)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center gap-2">
                        {isApproved && isCertificateGenerated ? (
                          <>
                            <Badge variant="default" className="w-fit">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Approved
                            </Badge>
                            <Badge
                              variant="default"
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Award className="w-3 h-3 mr-1" />
                              Certificate Generated
                            </Badge>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openConfirmDialog(item.id.toString())}
                            disabled={approving === item.id.toString()}
                            className="gap-2"
                          >
                            {approving === item.id.toString() ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-3 h-3" />
                                Approve & Generate
                              </>
                            )}
                          </Button>
                        )}
                      </div>

                    </TableCell>

                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewResponse(item)}
                        className="gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>

                  {/* Team Members Expanded Row */}
                  {hasTeamMembers && isExpanded && (
                    <TableRow className="bg-gray-50">
                      <TableCell colSpan={4} className="py-4">
                        <div className="ml-14 space-y-2">
                          <p className="text-sm font-semibold text-gray-700 mb-3">
                            Team Members ({teamMembers.length})
                          </p>
                          {teamMembers.map((member, idx) => {
                            const memberKey = `${member.guestId}-${idx}`;
                            const isApproving = teamMemberApproving === member.guestId.toString();
                            const isComplete = member.certificateApproved && member.certificateGenerated;

                            return (
                              <div
                                key={memberKey}
                                className="flex items-center gap-4 p-3 bg-white rounded-lg border border-gray-200 shadow-sm"
                              >
                                <Avatar className="w-9 h-9">
                                  <AvatarImage
                                    src={member.profilePicture || "/placeholder.svg"}
                                  />
                                  <AvatarFallback className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs">
                                    {member.name.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>

                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 capitalize truncate">
                                    {member.name}
                                  </p>
                                  <p className="text-xs text-gray-500 truncate">
                                    {member.email}
                                  </p>
                                  {member.phone && (
                                    <p className="text-xs text-gray-500">{member.phone}</p>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {isComplete ? (
                                    <>
                                      <Badge variant="default" className="text-xs">
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        Approved
                                      </Badge>
                                      <Badge variant="default" className="bg-green-600 text-xs">
                                        <Award className="w-3 h-3 mr-1" />
                                        Certificate Generated
                                      </Badge>
                                    </>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openTeamMemberApprovalDialog(
                                        member.userId,
                                        item.event.id,
                                        member.guestId,
                                        member.name
                                      )}
                                      disabled={isApproving}
                                      className="text-xs h-7"
                                    >
                                      {isApproving ? (
                                        <>
                                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                          Processing...
                                        </>
                                      ) : (
                                        <>
                                          <CheckCircle className="w-3 h-3 mr-1" />
                                          Approve & Generate
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Workshop Response Dialog */}
      <WorkshopResponseDialog
        open={isWorkshopDialogOpen}
        onOpenChange={setIsWorkshopDialogOpen}
        response={selectedResponse}
        isSubmission={isSubmission}
      />

      {/* Hackathon Dialog */}
      <HackathonDialog
        open={isHackathonDialogOpen}
        onOpenChange={setIsHackathonDialogOpen}
        response={selectedResponse}
      />

      {/* Approval Confirmation Dialog */}
      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent className="w-[35vw]">
          <DialogHeader>
            <DialogTitle>Approve & Generate Certificate</DialogTitle>
            <DialogDescription>
              {pendingApprovalId && getPendingApprovalItem() && (
                <>
                  Are you sure you want to approve the submission and generate certificate for{" "}
                  <span className="font-semibold capitalize">
                    {getPendingApprovalItem()!.name ||
                      getPendingApprovalItem()!.user.name}
                  </span>
                  ?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelApproval}>
              Cancel
            </Button>
            <Button onClick={handleApproveSubmission}>
              Approve & Generate Certificate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Team Member Approval & Certificate Generation Dialog */}
      <Dialog
        open={!!pendingTeamMemberApproval}
        onOpenChange={(open) => !open && setPendingTeamMemberApproval(null)}
      >
        <DialogContent className="w-[35vw]">
          <DialogHeader>
            <DialogTitle>Approve & Generate Certificate</DialogTitle>
            <DialogDescription>
              {pendingTeamMemberApproval && (
                <>
                  Are you sure you want to approve and generate certificate for team member{" "}
                  <span className="font-semibold capitalize">
                    {pendingTeamMemberApproval.name}
                  </span>
                  ?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingTeamMemberApproval(null)}>
              Cancel
            </Button>
            <Button onClick={handleApproveTeamMember}>
              Approve & Generate Certificate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EventResponseTable;