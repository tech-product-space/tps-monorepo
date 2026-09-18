"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail, Send } from "lucide-react";
import {
  getEmailTemplate,
  getEventById,
  updateEmailTemplate,
} from "@/services/Events/eventServices";
import { usePathname } from "next/navigation";

export default function Email() {
  const pathname = usePathname();
  const [eventType, setEventType] = useState<
    "Workshop" | "Teardown" | "Hackathon"
  >("Workshop");
  const [guestStatus, setGuestStatus] = useState<"Waitlist" | "Approved">(
    "Waitlist"
  );

  // Form fields
  const [subject, setSubject] = useState("");
  const [eventName, setEventName] = useState("");
  const [noOfPeople, setNoOfPeople] = useState("");
  const [referralLink, setReferralLink] = useState("");
  const [whatsappGroupLink, setWhatsappGroupLink] = useState("");
  const [date, setDate] = useState("");
  const [event, setEvent] = useState<any>(null);

  const getEmailTemplateFn = async (id: string, guestStatus: string) => {
    try {
      const response = await getEmailTemplate(id, guestStatus);
      console.log("Email Template:", response);
      setEvent(response.event);

      if (response.event?.eventType) {
        setEventType(response.event.eventType);
      }

      if (response.event?.eventTitle) {
        setEventName(response.event.eventTitle);
      }
    } catch (error) {
      console.error("Error fetching event:", error);
    }
  };

  const handleSubmit = async () => {
    const formData = {
      subject,
      eventName,
      ...(eventType === "Workshop" &&
        guestStatus === "Waitlist" && {
          noOfPeople,
          referralLink,
        }),
      whatsappGroupLink,
      ...(["Teardown", "Hackathon"].includes(eventType) && { date }),
    };

    let emailType: "Register" | "Approved" | "Waitlist" = "Register";

    if (eventType === "Workshop") {
      if (guestStatus === "Approved") {
        emailType = "Approved";
      } else if (guestStatus === "Waitlist") {
        emailType = "Waitlist";
      } else {
        emailType = "Register";
      }
    } else if (["Teardown", "Hackathon"].includes(eventType)) {
      emailType = "Register";
    }

    const formattedPayload = {
      emailType,
      template: formData,
    };

    try {
      const response = await updateEmailTemplate(event.id, formattedPayload);
      console.log("Email template updated successfully:", response);
    } catch (error) {
      console.error("Failed to update email template:", error);
    }
  };

  const renderWorkshopFields = () => {
    return (
      <div className="space-y-4">
        {/* Subject */}
        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            placeholder="Enter email subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {/* Event Name */}
        <div className="space-y-2">
          <Label htmlFor="eventName">Event Name</Label>
          <Input
            id="eventName"
            placeholder="Enter event name"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
          />
        </div>

        {/* Workshop Waitlist specific fields */}
        {guestStatus === "Waitlist" && (
          <>
            <div className="space-y-2">
              <Label htmlFor="noOfPeople">No of People</Label>
              <Input
                id="noOfPeople"
                placeholder="Enter number of people"
                value={noOfPeople}
                onChange={(e) => setNoOfPeople(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="referralLink">Referral Link</Label>
              <Input
                id="referralLink"
                placeholder="Enter referral link"
                value={referralLink}
                onChange={(e) => setReferralLink(e.target.value)}
              />
            </div>
          </>
        )}

        {/* WhatsApp Group Link */}
        <div className="space-y-2">
          <Label htmlFor="whatsappGroupLink">WhatsApp Group Link</Label>
          <Input
            id="whatsappGroupLink"
            placeholder="Enter WhatsApp group link"
            value={whatsappGroupLink}
            onChange={(e) => setWhatsappGroupLink(e.target.value)}
          />
        </div>
      </div>
    );
  };

  const renderTeardownFields = () => {
    return (
      <div className="space-y-4">
        {/* Subject */}
        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            placeholder="Enter email subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {/* Event Name */}
        <div className="space-y-2">
          <Label htmlFor="eventName">Event Name</Label>
          <Input
            id="eventName"
            placeholder="Enter event name"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
          />
        </div>

        {/* WhatsApp Group Link */}
        <div className="space-y-2">
          <Label htmlFor="whatsappGroupLink">WhatsApp Group Link</Label>
          <Input
            id="whatsappGroupLink"
            placeholder="Enter WhatsApp group link"
            value={whatsappGroupLink}
            onChange={(e) => setWhatsappGroupLink(e.target.value)}
          />
        </div>

        {/* Date */}
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            placeholder="Enter event date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>
    );
  };

  const renderHackathonFields = () => {
    return (
      <div className="space-y-4">
        {/* Subject */}
        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            placeholder="Enter email subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {/* Event Name */}
        <div className="space-y-2">
          <Label htmlFor="eventName">Event Name</Label>
          <Input
            id="eventName"
            placeholder="Enter event name"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
          />
        </div>

        {/* WhatsApp Group Link */}
        <div className="space-y-2">
          <Label htmlFor="whatsappGroupLink">WhatsApp Group Link</Label>
          <Input
            id="whatsappGroupLink"
            placeholder="Enter WhatsApp group link"
            value={whatsappGroupLink}
            onChange={(e) => setWhatsappGroupLink(e.target.value)}
          />
        </div>

        {/* Date */}
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            placeholder="Enter event date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>
    );
  };

  const renderFormFields = () => {
    switch (eventType) {
      case "Workshop":
        return renderWorkshopFields();
      case "Teardown":
        return renderTeardownFields();
      case "Hackathon":
        return renderHackathonFields();
      default:
        return renderWorkshopFields();
    }
  };

  useEffect(() => {
    if (pathname) {
      const parts = pathname.split("/");
      const id = parts[parts.length - 1]; // Get the last part as ID
      getEmailTemplateFn(id, guestStatus);
    }
  }, [pathname]);

  return (
    <div>
      <div className="grid grid-cols-1 gap-6">
        {/* Email Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              {eventType} Email Form
            </CardTitle>
            <CardDescription>
              Fill in the details for {eventType.toLowerCase()} event
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Event Type (From API)</Label>
                <div className="p-2 bg-gray-100 rounded border">
                  {eventType}
                </div>
              </div>

              {/* Guest Status - only for Workshop */}
              {eventType === "Workshop" && (
                <div className="space-y-2">
                  <Label htmlFor="guestStatus">Guest Status</Label>
                  <Select
                    value={guestStatus}
                    onValueChange={(value: any) => setGuestStatus(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Waitlist">Waitlist</SelectItem>
                      <SelectItem value="Approved">Approved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Dynamic Form Fields based on Event Type */}
            {renderFormFields()}

            {/* Submit Button */}
            <div className="flex justify-end pt-4 border-t">
              <Button
                onClick={handleSubmit}
                className="flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Submit
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
