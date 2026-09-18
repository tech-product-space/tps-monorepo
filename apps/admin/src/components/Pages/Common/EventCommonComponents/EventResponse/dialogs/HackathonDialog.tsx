"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { IEventFeedback } from "@/services/Events/eventFeedbackService";
import { formatDataTime } from "@/utils/formatDataTime";
import {
  Calendar,
  ExternalLink,
  Mail,
  Phone,
  User,
  CheckCircle,
  Clock,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  response: IEventFeedback | null;
}

const HackathonDialog = ({ open, onOpenChange, response }: Props) => {
  if (!response) return null;

  const {
    feedbackData,
    user,
    event,
    feedbackSubmittedAt,
    certificateGenerated,
    certificateGeneratedAt,
    certificateApproved,
    certificateId,
    teamMembers,
  } = response;

  // Helper function to get team member 2 details
  const getTeamMember2Details = () => {
    return {
      name: feedbackData.teamMember2Name,
      email: feedbackData.teamMember2Email,
      phone: feedbackData.teamMember2Phone,
    };
  };

  const member2Details = getTeamMember2Details();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl p-0 overflow-hidden rounded-xl">
        {/* Header */}
        <DialogHeader className="px-8 pt-8 pb-6 border-b">
          <div className="space-y-2">
            <DialogTitle className="text-2xl font-bold text-gray-900">
              Hackathon Submission Details
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Complete project, team, and technical submission information
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="max-h-[75vh] overflow-y-auto px-8 py-6 space-y-6">
          {/* Certificate Section - Show if certificate is generated */}
          {certificateGenerated && (
            <section className="rounded-xl border  p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Certificate Details
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500 block">
                    Certificate ID
                  </label>
                  <p className="text-gray-900 font-mono font-medium text-lg">
                    {certificateId}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500 block">
                    Generated At
                  </label>
                  <p className="text-gray-900">
                    {certificateGeneratedAt &&
                      formatDataTime(certificateGeneratedAt)}
                  </p>
                </div>
              </div>

              {/* Approval Status */}
              <div className="pt-4 border-t">
                <div className="flex items-center gap-3">
                  {certificateApproved ? (
                    <>
                      <CheckCircle className="w-5 h-" />
                      <div>
                        <p className="font-medium">Certificate Approved</p>
                        <p className="text-sm ">
                          This certificate has been verified and approved
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Clock className="w-5 h-5 " />
                      <div>
                        <p className="font-medium ">Pending Approval</p>
                        <p className="text-sm ">
                          Certificate is awaiting administrative approval
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Project Details Card */}
          <section className="bg-white rounded-xl border p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Project Details
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500 block mb-1">
                  Team Name
                </label>
                <p className="text-gray-900 font-medium">
                  {feedbackData.teamName}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {feedbackData.additionalMaterial && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 block mb-1">
                      Additional Material
                    </label>
                    <p className="text-gray-900">
                      {feedbackData.additionalMaterial}
                    </p>
                  </div>
                )}
                {feedbackData.agentCredentials && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 block mb-1">
                      Agent Credentials
                    </label>
                    <p className="text-gray-900">
                      {feedbackData.agentCredentials}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {feedbackData.agentLink && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 block mb-1">
                      Agent Link
                    </label>
                    <a
                      href={feedbackData.agentLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:underline transition-colors break-all"
                    >
                      <ExternalLink className="w-4 h-4 flex-shrink-0" />
                      {feedbackData.agentLink}
                    </a>
                  </div>
                )}

                {feedbackData.videoDemoLink && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 block mb-1">
                      Demo Video
                    </label>
                    <a
                      href={feedbackData.videoDemoLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:underline transition-colors break-all"
                    >
                      <ExternalLink className="w-4 h-4 flex-shrink-0" />
                      {feedbackData.videoDemoLink}
                    </a>
                  </div>
                )}

                {feedbackData.teardownDeck && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 block mb-1">
                      Teardown Deck
                    </label>
                    <a
                      href={feedbackData.teardownDeck}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:underline transition-colors break-all"
                    >
                      <ExternalLink className="w-4 h-4 flex-shrink-0" />
                      {feedbackData.teardownDeck}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Team Members Card */}
          <section className="bg-white rounded-xl border p-6 space-y-5">
            <h3 className="text-lg font-semibold text-gray-900">
              Team Members
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Member 1 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-500">
                    Member 1 (Primary)
                  </span>
                </div>
                <div className="space-y-2 pl-6">
                  <p className="text-gray-900 font-medium">
                    {feedbackData.teamMember1Name}
                  </p>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-4 h-4" />
                    <span className="text-sm">
                      {feedbackData.teamMember1Email}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-4 h-4" />
                    <span className="text-sm">
                      {feedbackData.teamMember1Phone}
                    </span>
                  </div>
                </div>
              </div>

              {/* Member 2 - Shows if teamMember2 exists OR if feedbackData has member2 info */}
              {feedbackData.teamMember2Name && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-500">
                      Member 2
                    </span>
                  </div>
                  <div className="space-y-2 pl-6">
                    <p className="text-gray-900 font-medium">
                      {feedbackData.teamMember2Name || "NA"}
                    </p>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail className="w-4 h-4" />
                      <span className="text-sm">
                        {feedbackData.teamMember2Email || "NA"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="w-4 h-4" />
                      <span className="text-sm">
                        {feedbackData.teamMember2Phone || "NA"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Event & Submission Info Card */}
          <section className="bg-white rounded-xl border p-6 space-y-5 mb-10">
            <h3 className="text-lg font-semibold text-gray-900">
              Event & Submission Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-500">
                    Event Name
                  </span>
                </div>
                <p className="text-gray-900 pl-6 font-medium">
                  {event.eventTitle}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-500">
                    Event Date
                  </span>
                </div>
                <p className="text-gray-900 pl-6">
                  {new Date(event.eventStartDate).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}{" "}
                  -{" "}
                  {new Date(event.eventEndDate).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-500">
                    Submitted Date
                  </span>
                </div>
                <p className="text-gray-900 pl-6">
                  {new Date(feedbackSubmittedAt).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-500">
                    Submitted By
                  </span>
                </div>
                <div className="space-y-1 pl-6">
                  <p className="text-gray-900 font-medium">{user.name}</p>
                  <p className="text-gray-600 text-sm">{user.email}</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HackathonDialog;
