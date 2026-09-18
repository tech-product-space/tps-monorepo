export const EVENT_CATEGORIES = [
"Normal",
"Community"
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
