export const EVENT_TYPES = [
  "Workshop",
  "Hackathon",
  "Teardown"
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
