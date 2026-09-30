import { EVENT_ATTENDEE_TYPE, EVENT_GUEST_STATUS } from "./eventGuest.js";

export const EVENT_REMINDER_STATUS = Object.freeze({
    PENDING: "pending",
    SCHEDULED: "scheduled",
    PROCESSING: "processing",
    SENT: "sent",
    FAILED: "failed"
});

export const EVENT_REMINDER_TARGET_STATUS = Object.freeze({
    ...EVENT_GUEST_STATUS,
    ALL: "all"
});

export const EVENT_REMINDER_ATTENDEE_TYPE = Object.freeze({
    ...EVENT_ATTENDEE_TYPE,
    ALL: "all"
});