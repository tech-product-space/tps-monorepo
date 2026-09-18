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
  Award,
  Calendar,
  Mail,
  Phone,
  User,
  Star,
  MessageSquare,
  ThumbsUp,
  Link as LinkIcon,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  response: IEventFeedback | null;
  isSubmission: boolean;
}

const WorkshopFeedbackDialog = ({ open, onOpenChange, response, isSubmission }: Props) => {
  if (!response) return null;

  const {
    feedbackData,
    user,
    event,
    feedbackSubmittedAt,
    certificateGenerated,
    certificateGeneratedAt,
    certificateId,
    teamMembers,
    certificateApproved,
  } = response;

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Format key for display
  const formatKey = (key: string) => {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .replace(/Pmf/g, 'PMF')
      .replace(/Aipm/g, 'AIPM');
  };

  // Check if value is a valid URL
  const isValidUrl = (value: string) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  };

  // Rating stars component
  const RatingStars = ({ rating }: { rating: string }) => {
    const numericRating = parseInt(rating);
    const maxStars = 10;
    
    return (
      <div className="flex items-center gap-1">
        {Array.from({ length: maxStars }).map((_, i) => (
          <Star
            key={i}
            className={`w-4 h-4 ${
              i < numericRating
                ? "text-yellow-500 fill-yellow-500"
                : "text-gray-300"
            }`}
          />
        ))}
        <span className="ml-2 text-lg font-semibold text-gray-900">
          {rating}/10
        </span>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl p-0 overflow-hidden rounded-xl">
        {/* Header */}
        <DialogHeader className="px-8 pt-8 pb-6 border-b">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-2xl font-bold text-gray-900">
                {isSubmission ? "Submission" : "Feedback"} Details
              </DialogTitle>
            </div>
            <DialogDescription className="text-gray-600">
              Complete feedback and certificate information
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="max-h-[75vh] overflow-y-auto px-8 py-6 space-y-6">
          {/* Certificate Section */}
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
                    {certificateGeneratedAt && formatDataTime(certificateGeneratedAt)}
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

          {/* Feedback Rating Card */}
          {feedbackData.rating && (
            <section className="bg-white rounded-xl border p-6 space-y-5">
              <div className="flex items-center gap-3">
                <Star className="w-5 h-5 " />
                <h3 className="text-lg font-semibold text-gray-900">
                  Event Rating
                </h3>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500 block mb-2">
                    Overall Rating
                  </label>
                  <RatingStars rating={feedbackData.rating} />
                </div>

                <div className="pt-4 border-t">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {feedbackData.interestedInPMF && (
                      <div>
                        <label className="text-sm font-medium text-gray-500 block mb-1">
                          Interested in PMF?
                        </label>
                        <div className="flex items-center gap-2">
                          {feedbackData.interestedInPMF === "Yes" || 
                           feedbackData.interestedInPMF === "Already Enrolled" ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-600" />
                          )}
                          <p className="text-gray-900 font-medium">
                            {feedbackData.interestedInPMF}
                          </p>
                        </div>
                      </div>
                    )}

                    {feedbackData.interestedInAIPM && (
                      <div>
                        <label className="text-sm font-medium text-gray-500 block mb-1">
                          Interested in AIPM?
                        </label>
                        <div className="flex items-center gap-2">
                          {feedbackData.interestedInAIPM === "Yes" || 
                           feedbackData.interestedInAIPM === "Already Enrolled" ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-600" />
                          )}
                          <p className="text-gray-900 font-medium">
                            {feedbackData.interestedInAIPM}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Feedback Details Card */}
          <section className="bg-white rounded-xl border p-6 space-y-5">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900">
                Feedback Details
              </h3>
            </div>

            <div className="space-y-6">
              {/* Feedback */}
              {feedbackData.feedback && (
                <div>
                  <label className="text-sm font-medium text-gray-500 block mb-2">
                    Feedback
                  </label>
                  <div className=" rounded-lg p-4 border">
                    <p className="text-gray-900 whitespace-pre-line">
                      {feedbackData.feedback}
                    </p>
                  </div>
                </div>
              )}

              {/* Improvement Suggestions */}
              {feedbackData.improvement && feedbackData.improvement !== "na" && (
                <div>
                  <label className="text-sm font-medium text-gray-500 block mb-2">
                    Suggestions for Improvement
                  </label>
                  <div className="rounded-lg p-4 border border-blue-100">
                    <p className="text-gray-900 whitespace-pre-line">
                      {feedbackData.improvement}
                    </p>
                  </div>
                </div>
              )}

              {/* Additional Links */}
              {(feedbackData.linkedinLink || 
                (feedbackData as any).additionalLinks) && (
                <div className="pt-4 border-t">
                  <label className="text-sm font-medium text-gray-500 block mb-3">
                    Additional Links
                  </label>
                  <div className="space-y-2">
                    {feedbackData.linkedinLink && (
                      <a
                        href={feedbackData.linkedinLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                      >
                        <LinkIcon className="w-4 h-4 flex-shrink-0" />
                        LinkedIn Profile
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* User Information Card */}
          <section className="bg-white rounded-xl border p-6 space-y-5">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900">
                Participant Information
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-500 block">
                  Name
                </label>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <p className="text-gray-900 font-medium">{user.name}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-500 block">
                  Email
                </label>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <p className="text-gray-900">{user.email}</p>
                </div>
              </div>

              {response.phone && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500 block">
                    Phone
                  </label>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <p className="text-gray-900">{response.phone}</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Event Information Card */}
          <section className="bg-white rounded-xl border p-6 space-y-5 mb-10">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900">
                Event Information
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-500 block">
                  Event Name
                </label>
                <p className="text-gray-900 font-medium">
                  {event.eventTitle}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-500 block">
                  Event Type
                </label>
                <p className="text-gray-900">
                  {event.eventType}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-500 block">
                  Event Dates
                </label>
                <p className="text-gray-900">
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
                <label className="text-sm font-medium text-gray-500 block">
                  Feedback Submitted
                </label>
                <p className="text-gray-900">
                  {formatDate(feedbackSubmittedAt)}
                </p>
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WorkshopFeedbackDialog;