"use client";

import type React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Share2,
  MapPin,
  Facebook,
  Twitter,
  Linkedin,
  MessageCircle,
  Check,
  X,
  Pencil,
  Calendar,
  Clock,
  TvMinimal,
  Link,
  CopyCheck,
  Copy,
} from "lucide-react";
import Image from "next/image";
import { IEvent } from "../../PastEvents";
import { usePathname, useRouter } from "next/navigation";
import { eventGuestStatus } from "@/services/Events/eventServices";
import { formatDateRange, formatTimeRange } from "@/utils/events";
import { BASE_FEEDBACK_LINK, BASE_SUBMISSION_LINK } from "@/utils/constants";
import { useState } from "react";
import AcceptResponseToggle from "../../../EventCommonComponents/AcceptResponseToggle";
import EnrollmentEmail from "../../../EventCommonComponents/EnrollmentEmail";

interface IGuest {
  id: number;
  name: string;
  phone: string;
  linkedin: string;
  role: string;
  userType: string;
  eventType: string;
  guestType: "Approved" | "Waitlist" | "Declined";
  eventName: string;
  userId: number;
  createdAt: string;
  updatedAt: string;
  user: {
    email: string;
    profile_picture?: string;
  };
}

interface OverviewProps {
  guests: IGuest[];
  events: IEvent;
  handleAcceptGuest: (guestId: number) => void;
  handleDeclineGuest: (guestId: number) => void;
  getApprovalStatusBadge: (status: IGuest["guestType"]) => React.ReactNode;
  getTimeAgo: (dateString: string) => string;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
}

const Overview: React.FC<OverviewProps> = ({
  guests,
  events,
  handleAcceptGuest,
  getApprovalStatusBadge,
  handleDeclineGuest,
  getTimeAgo,
  setActiveTab,
}) => {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [canAcceptResponse, setCanAcceptResponse] = useState(
    events.canAcceptResponse,
  );

  const data = events; // use prop or context as needed
  const startDate = new Date(data?.eventStartDate);
  const month = startDate
    .toLocaleString("en-US", { month: "short" })
    .toUpperCase();
  const day = startDate.getDate().toString().padStart(2, "0");

  const pathname = usePathname();

  const role = pathname.split("/")[1];

  const getLinkForEventForm = (eventType: string, slug: string) => {
    if (eventType === "Workshop") {
      return `${BASE_FEEDBACK_LINK}/${slug}`;
    }

    return `${BASE_SUBMISSION_LINK}/${slug}`;
  };

  const FORM_LINK = getLinkForEventForm(data.eventType, data.eventSlug);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(FORM_LINK);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      console.log(
        "Could not copy automatically. Please copy it manually:\n" + FORM_LINK,
      );
    }
  };

  const handleToggleFeedback = async (newValue: boolean) => {
    setCanAcceptResponse(newValue);
  };

  return (
    <div className="space-y-8">
      <div className="p-4 flex border rounded-2xl bg-white border-stone-100 gap-5">
        <div>
          <Image
            src={events.eventCreativeUrl}
            alt={"Event Image"}
            width={750}
            height={400}
            className="object-contain max-h-[400px] w-full rounded-xl"
          />
        </div>
        <div className="flex flex-col justify-between gap-5 flex-1 p-4">
          <div className="flex flex-col gap-5">
            <div className="text-lg font-bold">When & Where</div>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {/* ✅ Custom layout injected here */}
                <div className="flex flex-col gap-1">
                  <div className="bg-gray-100 rounded-lg p-3 text-center w-[80px]">
                    <div className="text-xs text-gray-500 uppercase">
                      {month}
                    </div>
                    <div className="text-xl font-bold text-gray-900">{day}</div>
                  </div>
                  <div className="flex items-center gap-[4px]">
                    <div className="flex items-center justify-center p-2.5">
                      <Calendar className="w-6 h-6" />
                    </div>
                    <span className="text-[16px] text-[#010620B2] font-medium">
                      {formatDateRange(
                        data?.eventStartDate,
                        data?.eventEndDate,
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-[4px]">
                    <div className="flex items-center justify-center p-2.5">
                      <Clock className="w-6 h-6" />
                    </div>
                    <span className="text-[16px] text-[#010620B2] font-medium">
                      {formatTimeRange(
                        data?.eventStartTime,
                        data?.eventEndTime,
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-[4px]">
                    <div className="flex items-center justify-center p-2.5">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <span className="text-[16px] text-[#010620B2] font-medium">
                      {data?.locationType}
                    </span>
                  </div>

                  <div className="flex items-center gap-[4px]">
                    <div className="flex items-center justify-center p-2.5">
                      <TvMinimal className="w-6 h-6" />
                    </div>
                    {data?.location ? (
                      <a
                        href={data.location}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[16px] text-blue-600 font-medium hover:underline"
                      >
                        Event Link
                      </a>
                    ) : (
                      <p>N/A</p>
                    )}
                  </div>

                  {canAcceptResponse && (
                    <div className="flex items-center gap-1">
                      <div className="flex items-center justify-center p-2.5">
                        <Link className="w-6 h-6" />
                      </div>

                      <div className="flex items-center gap-1.5">
                        <a
                          href={data.location}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[16px] text-blue-600 font-medium hover:underline"
                        >
                          {data.eventType === "Workshop"
                            ? "Feedback Form Link"
                            : "Submission Form Link"}
                        </a>

                        <Button
                          variant={"ghost"}
                          disabled={copied}
                          className="cursor-pointer"
                          onClick={handleCopy}
                        >
                          {copied ? (
                            <CopyCheck size={18} />
                          ) : (
                            <Copy size={18} />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  <AcceptResponseToggle
                    eventId={data.id}
                    initialValue={data.canAcceptResponse}
                    onToggle={handleToggleFeedback}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 bg-transparent cursor-pointer"
              onClick={(e) => {
                router.push(`/${role}/past-events/edit/${events.id}`);
              }}
            >
              <Pencil className="w-4 h-4" />
              Edit Event
            </Button>
            <Button
              variant="outline"
              className="flex-1 bg-transparent cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              Share Event
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-lg font-semibold">Share via</p>
            <div className="flex gap-4">
              <Button
                size="sm"
                variant="outline"
                className="p-2 bg-transparent"
              >
                <Facebook className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="p-2 bg-transparent"
              >
                <Twitter className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="p-2 bg-transparent"
              >
                <Linkedin className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="p-2 bg-transparent"
              >
                <MessageCircle className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
      <EnrollmentEmail eventId={data?.id} eventType={data?.eventType} />
      {/* Recent Registrations */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Recent Registrations</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveTab("guests")}
          >
            All Guests →
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {guests.slice(0, 5).map((guest) => (
              <div
                key={guest.id}
                className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarImage
                      src={guest.user.profile_picture || "/placeholder.svg"}
                    />
                    <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                      {guest.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium text-gray-900">
                      {guest.name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {guest.user.email}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {getApprovalStatusBadge(guest.guestType)}
                  <span className="text-sm text-gray-500">
                    {getTimeAgo(guest.createdAt)}
                  </span>
                  {guest.guestType === "Waitlist" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-600 hover:bg-green-50 bg-transparent"
                        onClick={() => handleAcceptGuest(guest.userId)}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-600 hover:bg-red-50 bg-transparent"
                        onClick={() => handleDeclineGuest(guest.userId)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Overview;
