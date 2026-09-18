import { useState } from "react";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import EnrollmentEmailSlider from "./EnrollmentSilder/EnrollmentEmailSlider";
import { getEmailTempateForJoinEvent } from "@/services/Events/eventServices";

export default function EnrollmentEmail({
  eventId,
  eventType,
}: {
  eventId: any;
  eventType: any;
}) {
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [emailBody, setEmailBody] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [subject, setSubject] = useState("");

  const handleCardClick = async (templateType: string) => {
    setSelectedEvent(eventId);
    setType(templateType);

    try {
      const response = await getEmailTempateForJoinEvent({
        eventId,
        type: templateType,
      });
      setEmailBody(response.template.body);
      setDate(response.template.date);
      setStartTime(response.template.startTime);
      setEndTime(response.template.endTime);
      setSubject(response.template.subject);
    } catch (error) {
      // No template saved yet for this type — start fresh
      setEmailBody("Enter the Body ...");
      setDate("");
      setStartTime("");
      setEndTime("");
      setSubject("");
      console.error("Failed to fetch template:", error);
    }
  };

const statusOptions =
  eventType === "Workshop"
    ? [
        { label: "Pending", type: "Pending", icon: Clock, color: "text-orange-500" },
        { label: "Approved", type: "Approved", icon: CheckCircle, color: "text-green-500" },
        { label: "Declined", type: "Declined", icon: XCircle, color: "text-red-500" },
        { label: "Reschedule", type: "Reschedule", icon: XCircle, color: "text-yellow-500" },
      ]
    : [
        { label: "Registered (Default)", type: "Registered", icon: CheckCircle, color: "text-green-500" },
        { label: "Registered — Student", type: "Registered_Student", icon: CheckCircle, color: "text-blue-500" },
        { label: "Registered — Professional", type: "Registered_Professional", icon: CheckCircle, color: "text-purple-500" },
      ];

  return (
    <div className="p-6 bg-white rounded-2xl border font-sans">
      <h1 className="text-2xl font-bold mb-2">Registraition Email</h1>
      <h2 className="text-lg font-medium mb-2">
        {eventType === "Workshop"
          ? "Customize the emails sent when a guest registers for the event and for when you approve or decline their registration."
          : "Upon registration, we send guests a confirmation email that includes a calendar invite. Student/Professional templates are optional — guests without a matching one get the Default email."}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {statusOptions.map(({ label, type: templateType, icon: Icon, color }) => (
          <div
            key={templateType}
            className="border border-gray-300 rounded-lg p-4 flex flex-col gap-3 cursor-pointer hover:bg-gray-50"
            onClick={() => handleCardClick(templateType)}
          >
            <div className={`flex items-center gap-2 ${color}`}>
              <Icon size={20} />
              <span className="font-medium text-gray-800">{label}</span>
            </div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>

      {/* Slider */}
      <EnrollmentEmailSlider
        selectedEvent={selectedEvent}
        setSelectedEvent={setSelectedEvent}
        eventId={eventId}
        date={date}
        startTime={startTime}
        endTime={endTime}
        subject={subject}
        type={type}
        emailBody={emailBody}
      />
    </div>
  );
}
