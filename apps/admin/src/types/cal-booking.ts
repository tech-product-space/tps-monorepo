export type CalBookingStatus = "booked" | "cancelled" | "rescheduled";

export interface ICalBooking {
    id: string;
    bookingUid: string;
    iCalUID: string;
    eventTitle: string;
    eventType: string;
    startTime: string;
    endTime: string;
    attendeeName: string;
    attendeeEmail: string;
    attendeePhone: string;
    attendeeNotes?: string;
    attendeeTimeZone?: string;
    cancellationReason?: string;
    rescheduleReason?: string;
    meetingUrl?: string;
    status: CalBookingStatus;
    rawPayload: any,
}