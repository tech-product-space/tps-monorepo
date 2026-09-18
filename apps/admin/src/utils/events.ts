import { format, parseISO } from "date-fns";


export interface CalendarEventInput {
  summary: string;
  description?: string;
  eventStartDate: string;
  eventEndDate: string;
  eventStartTime: string;
  eventEndTime: string;
  timeZone: string;
}

export const buildCalendarEvent = ({
  summary,
  description,
  eventStartDate,
  eventEndDate,
  eventStartTime,
  eventEndTime,
  timeZone = "Asia/Kolkata",
}: CalendarEventInput) => {
  // Helper to convert "11 AM" → hours: 11
  const parseTime = (timeStr: string) => {
    const [time, modifier] = timeStr.split(" ");
    let [hours, minutes] = time.split(":").map(Number);
    
    if (!minutes) minutes = 0;
    
    if (modifier.toLowerCase() === "pm" && hours < 12) {
      hours += 12;
    }
    if (modifier.toLowerCase() === "am" && hours === 12) {
      hours = 0;
    }
    
    return { hours, minutes };
  };

  // Alternative approach: Calculate UTC time from IST
  const createUTCFromIST = (dateStr: string, timeStr: string) => {
    const time = parseTime(timeStr);
    const [year, month, day] = dateStr.split("-").map(Number);
    
    // Create date assuming IST time
    // We create the date in local time, then adjust for IST
    const date = new Date(Date.UTC(year, month - 1, day, time.hours, time.minutes, 0, 0));
    
    // IST is UTC+5:30, so we need to subtract 5 hours and 30 minutes from the IST time to get UTC
    date.setUTCHours(date.getUTCHours() - 5);
    date.setUTCMinutes(date.getUTCMinutes() - 30);
    
    return date.toISOString();
  };

  // Use the UTC approach for better compatibility
  const startDateTime = createUTCFromIST(eventStartDate, eventStartTime);
  const endDateTime = createUTCFromIST(eventEndDate, eventEndTime);

  return {
    summary,
    ...(description && { description }), // Only include if description exists
    start: {
      dateTime: startDateTime,
      timeZone,
    },
    end: {
      dateTime: endDateTime,
      timeZone,
    },
  };
};

export const formatDateRange = (start: string, end: string) => {
  const startDate = parseISO(start);
  const endDate = parseISO(end);

  const getOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"],
      v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const startDay = getOrdinal(startDate.getDate());
  const startMonth = format(startDate, "MMM");
  const endDay = getOrdinal(endDate.getDate());
  const endMonth = format(endDate, "MMM");
  const year = format(endDate, "yyyy");

  if (start === end) {
    return `${endDay} ${endMonth}, ${year}`;
  }

  return `${startDay} ${startMonth} – ${endDay} ${endMonth}, ${year}`;
};

export const formatTimeRange = (startTime: string | null, endTime: string | null) => {
  if (!startTime || !endTime || startTime === "null" || endTime === "null") return "NA";
  return ` ${startTime.trim()} – ${endTime.trim()} IST`;
};
