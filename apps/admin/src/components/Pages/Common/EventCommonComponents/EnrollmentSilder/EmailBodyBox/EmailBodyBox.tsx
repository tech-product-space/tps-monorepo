"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { postEmailTempateForJoinEvent } from "@/services/Events/eventServices";
import { useNotification } from "@/helpers/NotificationContext";
import { Copy, ClipboardPaste } from "lucide-react";
import EmailTextEditor3 from "@/components/Rich-Text-Editor/EmailTextEditor3";

interface EmailBodyBoxProps {
  eventId: string;
  type: any;
  subject: string;
  date: string;
  startTime: string;
  endTime: string;
  emailBody: string;
}

export default function EmailBodyBox({
  eventId,
  type,
  date,
  startTime,
  endTime,
  subject,
  emailBody,
}: EmailBodyBoxProps) {
  const { showNotification } = useNotification();
  const [Emailsubject, setEmailSubject] = useState(subject || "");
  const [Emaildate, setEmaildate] = useState(date || "");
  const [EmailstartTime, setEmailstartTime] = useState(startTime || "");
  const [EmailendTime, setEmailendTime] = useState(endTime || "");

  const [content, setContent] = useState(emailBody || "");

  useEffect(() => {
    setContent(emailBody);
    setEmailendTime(endTime);
    setEmailstartTime(startTime);
    setEmaildate(date);
    setEmailSubject(subject);
  }, [emailBody, endTime, startTime, date, subject]);

  const handleCopy = () => {
    const template = {
      subject: Emailsubject,
      body: content,
    };
    localStorage.setItem("email_template_clipboard", JSON.stringify(template));
    showNotification("success", "Template copied to local storage");
  };

  const handlePaste = () => {
    const savedTemplate = localStorage.getItem("email_template_clipboard");
    if (savedTemplate) {
      try {
        const template = JSON.parse(savedTemplate);
        setEmailSubject(template.subject || "");
        setContent(template.body || "");
        showNotification("success", "Template pasted successfully");
      } catch (error) {
        showNotification("error", "Failed to parse saved template");
      }
    } else {
      showNotification("error", "No template found in local storage");
    }
  };

  const saveEmailFunction = async () => {
    if (!content.trim()) {
      showNotification("error", "Email content cannot be empty");
      return;
    }

    if (type?.startsWith("Registered") || type === "Approved") {
      if (!Emaildate || !EmailstartTime || !EmailendTime || !Emailsubject) {
        showNotification("error", "All fields  are required");
        return;
      }
    } else {
      if (!Emailsubject) {
        showNotification("error", "Subject and body are required");
        return;
      }
    }

    try {
      await postEmailTempateForJoinEvent({
        eventId: eventId,
        type: type,
        date: Emaildate,
        startTime: EmailstartTime,
        endTime: EmailendTime,
        subject: Emailsubject,
        body: content,
      });
      showNotification("success", "Email Template saved successfully");
    } catch (error) {
      console.error("❌ Failed to save email:", error);
      showNotification("error", "Failed to save email");
    }
  };

  return (
    <div className="overflow-y-auto gap-4 flex flex-col">
      <div>
        <Label className="mb-2">Subject</Label>
        <Input
          value={Emailsubject}
          onChange={(e) => setEmailSubject(e.target.value)}
          className="mb-2"
          placeholder="Subject..."
        />
      </div>

      {(type?.startsWith("Registered") ||
        type === "Approved" ||
        type === "Reschedule") && (
        <>
          <div>
            <Label className="mb-2">Start Date</Label>
            <Input
              value={Emaildate}
              onChange={(e) => setEmaildate(e.target.value)}
              type="date"
              className="mb-2"
              placeholder="Date..."
            />
          </div>
          <div>
            <Label className="mb-2">Start Time</Label>
            <Input
              value={EmailstartTime}
              onChange={(e) => setEmailstartTime(e.target.value)}
              type="time"
              className="mb-2"
              placeholder="Start Time..."
            />
          </div>
          <div>
            <Label className="mb-2">End Time</Label>
            <Input
              value={EmailendTime}
              onChange={(e) => setEmailendTime(e.target.value)}
              type="time"
              className="mb-2"
              placeholder="End Time..."
            />
          </div>
        </>
      )}

      <div>
        <Label className="mb-2">Email Body</Label>

        <EmailTextEditor3
          value={content}
          onChange={(val: string) => setContent(val)}
        />

        <div className="flex flex-wrap gap-2 mt-4">
          <Button
            variant="outline"
            onClick={handleCopy}
            className="flex items-center gap-2 cursor-pointer border-gray-400 text-gray-700 hover:bg-gray-100"
          >
            <Copy size={16} /> Copy Template
          </Button>

          <Button
            variant="outline"
            onClick={handlePaste}
            className="flex items-center gap-2 cursor-pointer border-gray-400 text-gray-700 hover:bg-gray-100"
          >
            <ClipboardPaste size={16} /> Paste Template
          </Button>
          <Button
            onClick={saveEmailFunction}
            className="ml-auto bg-[#335DC8] hover:bg-[#335DC8] px-10 cursor-pointer"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
