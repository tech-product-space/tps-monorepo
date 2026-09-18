"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Overview from "./Tabs/Overview";
import Guest from "./Tabs/Guest";
import Cookies from "js-cookie";
import { usePathname, useRouter } from "next/navigation";
import { useNotification } from "@/helpers/NotificationContext";
import {
  eventGuestStatus,
  getAllGuests,
  getEventById,
  getEventReferals,
  sendEmailNotification,
} from "@/services/Events/eventServices";
import { IEvent } from "../Events";
import { EventReferrals } from "../../EventCommonComponents/Referrals/Referrals";
import ApproveReferrer from "./ApproveReferrer/ApproveReferrer";
import { buildCalendarEvent } from "@/utils/events";
import { checkIfUserHaveToken } from "@/components/Common/GoogleModule";
import CertificateTemplate from "../../EventCommonComponents/CertificateTemplate/CertificateTemplate";
import EventResponse from "../../EventCommonComponents/EventResponse/EventResponse";
import { BulkAction } from "./bulk-actions";
import ReminderEmailV2 from "../../EventCommonComponents/ReminderEmailV2/ReminderEmailV2";

interface User {
  name: string;
  email: string;
  phone: string;
  role: string;
}

export interface IGuest {
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

export interface ReferralSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  referralCode: string;
  memberCount: string;
  type: string;
}

export default function ManageEventPage() {
  const { showNotification } = useNotification();
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [event, setEvent] = useState<IEvent | null>(null);
  const [guests, setGuests] = useState<IGuest[]>([]);
  const [referrals, setReferrals] = useState<ReferralSummary[]>([]);
  const [selectedGuests, setSelectedGuests] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const pathnameId = usePathname().split("/").pop();

  const mergedDataforApproveReferral = referrals.map((ref) => {
    const guestMatch = guests.find(
      (g) => g.user?.email && g.user.email === ref.email,
    );

    return {
      ...ref,
      guestType: guestMatch?.guestType ?? null,
    };
  });

  const sendCalendarEvent = (user_id: number) => {
    const requestbody = {
      user_id: user_id.toString(),
      apps: "GOOGLE",
    };
    if (event) {
      const eventRequestBody = buildCalendarEvent({
        summary: event.eventTitle,
        description: `<a href="${event.location}">Join the meeting here</a>`,
        eventStartDate: event.eventStartDate,
        eventEndDate: event.eventEndDate,
        eventStartTime: event.eventStartTime,
        eventEndTime: event.eventEndTime,
        timeZone: "Asia/Kolkata",
      });
      checkIfUserHaveToken(requestbody, eventRequestBody);
    }
  };

  const getEventByIdFn = async (id: string) => {
    try {
      setLoading(true);
      const response = await getEventById(id);

      setEvent(response.event);

      const requestBody = { eventId: id };
      const guest = await getAllGuests(requestBody);

      if (guest.result === "SUCCESS") {
        setGuests(guest.registrations || []);
      }
    } catch (error) {
      console.error("Error fetching guests:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptGuest = async (guestId: number) => {
    try {
      await eventGuestStatus({
        userIds: [guestId],
        eventId: event?.id || 0,
        status: "Approved",
      });

      const requestBody = {
        type: "Approved",
        userIds: [guestId],
        eventId: event?.id || 0,
      };

      // await sendCalendarEvent(guestId);

      await sendEmailNotification(requestBody);

      showNotification(
        "success",
        "Action Successful",
        "Guest has been approved successfully",
      );

      setGuests((prev) =>
        prev.map((guest) =>
          guest.userId === guestId
            ? { ...guest, guestType: "Approved" as const }
            : guest,
        ),
      );
    } catch (error) {
      console.error("Error approving guest:", error);
    }
  };

  const handleDeclineGuest = async (guestId: number) => {
    try {
      await eventGuestStatus({
        userIds: [guestId],
        eventId: event?.id || 0,
        status: "Declined",
      });

      const requestBody = {
        type: "Declined",
        userIds: [guestId],
        eventId: event?.id || 0,
      };

      const response = await sendEmailNotification(requestBody);

      setGuests((prev) =>
        prev.map((guest) =>
          guest.userId === guestId
            ? { ...guest, guestType: "Declined" as const }
            : guest,
        ),
      );
    } catch (error) {
      console.error("Error declining guest:", error);
    }
  };

  const handleBulkAccept = async (action: BulkAction) => {
    try {
      let userIds: number[] = [];

      switch (action) {
        case "APPROVE_ALL":
          userIds = guests
            .filter((guest) => guest.guestType === "Waitlist")
            .map((guest) => guest.userId);
          break;

        case "APPROVE_PROFESSIONALS":
          userIds = guests
            .filter(
              (guest) =>
                guest.guestType === "Waitlist" &&
                guest.userType === "Professional",
            )
            .map((guest) => guest.userId);
          break;

        case "APPROVE_STUDENTS":
          userIds = guests
            .filter(
              (guest) =>
                guest.guestType === "Waitlist" && guest.userType === "Student",
            )
            .map((guest) => guest.userId);
          break;

        default:
          return;
      }

      if (userIds.length === 0) {
        showNotification(
          "error",
          "No Guests Found",
          "There are no waitlisted guests to approve",
        );
        return;
      }

      await eventGuestStatus({
        userIds,
        eventId: event?.id || 0,
        status: "Approved",
      });

      const requestBody = {
        type: "Approved",
        userIds,
        eventId: event?.id || 0,
      };

      await sendEmailNotification(requestBody);

      showNotification(
        "success",
        "Action Successful",
        "Guests have been approved successfully",
      );

      setGuests((prev) =>
        prev.map((guest) =>
          userIds.includes(guest.userId)
            ? { ...guest, guestType: "Approved" as const }
            : guest,
        ),
      );

      setSelectedGuests([]);
    } catch (error: any) {
      console.error("Error bulk approving guests:", error);

      showNotification(
        "error",
        "Action Failed",
        error?.message || "Failed to approve guests",
      );
    }
  };

  const handleBulkDecline = async (action: BulkAction) => {
    try {
      let userIds: number[] = [];

      switch (action) {
        case "DECLINE_ALL":
          userIds = guests
            .filter((guest) => guest.guestType === "Waitlist")
            .map((guest) => guest.userId);
          break;

        case "DECLINE_PROFESSIONALS":
          userIds = guests
            .filter(
              (guest) =>
                guest.guestType === "Waitlist" &&
                guest.userType === "Professional",
            )
            .map((guest) => guest.userId);
          break;

        case "DECLINE_STUDENTS":
          userIds = guests
            .filter(
              (guest) =>
                guest.guestType === "Waitlist" && guest.userType === "Student",
            )
            .map((guest) => guest.userId);
          break;

        default:
          return;
      }

      if (userIds.length === 0) {
        showNotification(
          "error",
          "No Guests Found",
          "There are no waitlisted guests to decline",
        );
        return;
      }

      await eventGuestStatus({
        userIds,
        eventId: event?.id || 0,
        status: "Declined",
      });

      const requestBody = {
        type: "Declined",
        userIds,
        eventId: event?.id || 0,
      };

      await sendEmailNotification(requestBody);

      showNotification(
        "success",
        "Action Successful",
        "Guests have been declined successfully",
      );

      setGuests((prev) =>
        prev.map((guest) =>
          userIds.includes(guest.userId)
            ? { ...guest, guestType: "Declined" as const }
            : guest,
        ),
      );

      setSelectedGuests([]);
    } catch (error: any) {
      console.error("Error bulk declining guests:", error);

      showNotification(
        "error",
        "Action Failed",
        error?.message || "Failed to decline guests",
      );
    }
  };

  const handleBulkReschedule = async () => {
    try {
      // Collect IDs to reschedule
      const userIds =
        selectedGuests.length > 0
          ? selectedGuests
          : guests
              .filter((guest) => guest.guestType === "Approved")
              .map((guest) => guest.userId);

      if (userIds.length === 0) {
        showNotification(
          "error",
          "No Guests Found",
          "There are no waitlisted guests to approve",
        );
        return;
      }

      const requestBody = {
        type: "Reschedule",
        userIds,
        eventId: event?.id || 0,
      };

      await sendEmailNotification(requestBody);

      // Optionally update UI
      // setSelectedGuests([]);
      // toast.success("Reschedule email sent successfully!");
    } catch (error) {
      console.error("Error bulk rescheduling guests:", error);
    }
  };

  const getApprovalStatusBadge = (status: IGuest["guestType"]) => {
    switch (status) {
      case "Approved":
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case "Declined":
        return <Badge className="bg-red-100 text-red-800">Declined</Badge>;
      case "Waitlist":
        return (
          <Badge className="bg-yellow-100 text-yellow-800">Waitlist</Badge>
        );
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60),
    );

    if (diffInMinutes < 60) {
      return `${diffInMinutes} minutes ago`;
    } else if (diffInMinutes < 1440) {
      const hours = Math.floor(diffInMinutes / 60);
      return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    } else {
      const days = Math.floor(diffInMinutes / 1440);
      return `${days} day${days > 1 ? "s" : ""} ago`;
    }
  };

  const getAllReferralsFn = async () => {
    try {
      const data = await getEventReferals(pathnameId);
      setReferrals(data.data);
    } catch {
      showNotification("error", "Error", "Failed to fetch referrals");
    }
  };

  useEffect(() => {
    getAllReferralsFn();
  }, []);

  useEffect(() => {
    if (pathname) {
      const parts = pathname.split("/");
      const id = parts[parts.length - 1]; // Get the last part as ID
      getEventByIdFn(id);
    }
  }, [pathname]);

  useEffect(() => {
    const storedUser = Cookies.get("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">Loading guests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center gap-5">
              <ArrowLeft
                className="h-5 w-5 m-2 cursor-pointer"
                onClick={() => router.back()}
              />
              <h1 className="text-2xl font-bold text-gray-900">
                {event?.eventTitle}
              </h1>
            </div>
            <a
              href={`https://staging-product-space-ui.vercel.app/events/${event?.eventSlug}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                variant="outline"
                className="flex items-center gap-2 bg-transparent"
              >
                Event Page
                <ExternalLink className="w-4 h-4" />
              </Button>
            </a>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 h-full flex flex-col mt-5">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-col h-[calc(100vh-4.5rem)] mb-5"
          >
            <TabsList className="grid w-full grid-cols-6 bg-transparent border-b border-gray-200 rounded-none h-auto p-0">
              <TabsTrigger
                value="overview"
                className="data-[state=active]:border-0 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent rounded-none pb-4"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="guests"
                className="data-[state=active]:border-0 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent rounded-none pb-4"
              >
                Guests
              </TabsTrigger>
              <TabsTrigger
                value="referrals"
                className="data-[state=active]:border-0 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent rounded-none pb-4"
              >
                Referrals
              </TabsTrigger>
              <TabsTrigger
                value="reminder-email-v2"
                className="data-[state=active]:border-0 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent rounded-none pb-4"
              >
                Reminder Email
              </TabsTrigger>
              <TabsTrigger
                value="certificate-template"
                className="data-[state=active]:border-0 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent rounded-none pb-4"
              >
                Certificate Template
              </TabsTrigger>

              {event?.eventType === "Workshop" && (
                <TabsTrigger
                  value="feedbacks"
                  className="data-[state=active]:border-0 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent rounded-none pb-4"
                >
                  Feedbacks
                </TabsTrigger>
              )}
              {(event?.eventType === "Teardown" ||
                event?.eventType === "Hackathon") && (
                <TabsTrigger
                  value="submissions"
                  className="data-[state=active]:border-0 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent rounded-none pb-4"
                >
                  Submissions
                </TabsTrigger>
              )}
            </TabsList>
            <div className="flex-1 min-h-0 overflow-y-auto py-8">
              <TabsContent value="overview" className="mt-0 mb-5 px-10">
                {event && (
                  <Overview
                    guests={guests}
                    events={event}
                    handleAcceptGuest={handleAcceptGuest}
                    handleDeclineGuest={handleDeclineGuest}
                    getApprovalStatusBadge={getApprovalStatusBadge}
                    getTimeAgo={getTimeAgo}
                    setActiveTab={setActiveTab}
                  />
                )}
              </TabsContent>
              <TabsContent value="guests" className="mt-0 mb-5 px-10">
                <Guest
                  guests={guests}
                  handleAcceptGuest={handleAcceptGuest}
                  handleDeclineGuest={handleDeclineGuest}
                  getApprovalStatusBadge={getApprovalStatusBadge}
                  getTimeAgo={getTimeAgo}
                  handleBulkReschedule={handleBulkReschedule}
                  handleBulkAccept={handleBulkAccept}
                  handleBulkDecline={handleBulkDecline}
                  selectedGuests={selectedGuests}
                  setSelectedGuests={setSelectedGuests}
                />
              </TabsContent>

              {/* <TabsContent value="approve-referrer" className="mt-0 mb-5 px-10">
                <ApproveReferrer data={mergedDataforApproveReferral} />
              </TabsContent> */}

              <TabsContent value="referrals" className="mt-0 mb-5 px-10">
                <EventReferrals
                  eventId={event?.id || 0}
                  getApprovalStatusBadge={getApprovalStatusBadge}
                />
              </TabsContent>
              <TabsContent
                value="reminder-email-v2"
                className="mt-0 mb-5 px-10"
              >
                <ReminderEmailV2 />
              </TabsContent>
              <TabsContent
                value="certificate-template"
                className="mt-0 mb-5 px-10"
              >
                <CertificateTemplate />
              </TabsContent>
              {event?.eventType === "Workshop" && (
                <TabsContent value="feedbacks" className="mt-0 mb-5 px-10">
                  <EventResponse
                    eventId={event?.id || 0}
                    type="feedback"
                    eventType={event?.eventType}
                  />
                </TabsContent>
              )}
              {(event?.eventType === "Teardown" ||
                event?.eventType === "Hackathon") && (
                <TabsContent value="submissions" className="mt-0 mb-5 px-10">
                  <EventResponse
                    eventId={event?.id || 0}
                    type="submission"
                    eventType={event?.eventType}
                  />
                </TabsContent>
              )}
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
