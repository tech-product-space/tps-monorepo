import { useEffect } from "react";
import { X } from "lucide-react";
import EmailBodyBox from "./EmailBodyBox/EmailBodyBox";

interface EnrollmentEmailSliderProps {
  selectedEvent: any | null;
  setSelectedEvent: (event: any | null) => void;
  eventId: any | null;
  subject: any | null;
  date: any | null;
  startTime: any | null;
  endTime: any | null;
  emailBody: string;
  type: string | null;
}

export default function EnrollmentEmailSlider({
  selectedEvent,
  setSelectedEvent,
  eventId,
  date,
  startTime,
  endTime,
  subject,
  emailBody,
  type,
}: EnrollmentEmailSliderProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedEvent(null);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [setSelectedEvent]);

  useEffect(() => {}, []);
  return (
    <>
      {/* Backdrop */}
      {selectedEvent && (
        <div
          className="fixed inset-0 bg-black/60 bg-opacity-40 z-40"
          onClick={() => setSelectedEvent(null)}
        />
      )}

      {/* Slider Panel */}
      <div
        className={`fixed top-0 right-0 h-full bg-white border-l border-gray-200 shadow-xl z-50 transform transition-transform duration-700 ease-in-out
        ${selectedEvent ? "translate-x-0" : "translate-x-full"}
        w-full sm:w-[80vw] lg:w-[700px]`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Event Email Body
          </h2>
          <button
            onClick={() => setSelectedEvent(null)}
            className="text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-5  overflow-y-auto h-screen pb-20">
          <EmailBodyBox
            eventId={eventId}
            subject={subject}
            date={date}
            startTime={startTime}
            endTime={endTime}
            type={type}
            emailBody={emailBody}
          />
        </div>
      </div>
    </>
  );
}
