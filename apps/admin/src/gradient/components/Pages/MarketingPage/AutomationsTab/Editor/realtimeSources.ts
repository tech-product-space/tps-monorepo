import {
  CalendarDays,
  FileText,
  Megaphone,
  UserPlus,
  Users,
} from "lucide-react";

import type { CampaignSourceType } from "@/gradient/types/campaign";

export interface RealtimeSource {
  type: CampaignSourceType;
  Icon: typeof Users;
  /** One line in the picker, before anything is chosen. */
  hint: string;
  /** The dialog's subtitle once it is: what the narrowing below answers. */
  question: string;
  /** False only for `users` — an account is an account. */
  narrowable: boolean;
}

/**
 * The six things that can *start* a journey.
 *
 * Narrower than the audience list on purpose. Feedback, certificates, lesson
 * completion and newsletter signup are recorded and can be branched on, but
 * they happen to somebody who is usually already mid-journey — a workflow
 * rooted there would enrol people the first workflow is still mailing.
 *
 * Lifted out of `TriggerTab` so the dialog and the tab read from one list
 * rather than each keeping its own copy of the labels and icons.
 */
export const REALTIME_SOURCES: RealtimeSource[] = [
  {
    type: "leads",
    Icon: FileText,
    hint: "Any website form or enquiry",
    question: "Which website forms should start it?",
    narrowable: true,
  },
  {
    type: "metaLeads",
    Icon: Megaphone,
    hint: "Filled a Facebook lead form",
    question: "Which Facebook lead forms should start it?",
    narrowable: true,
  },
  {
    type: "eventGuests",
    Icon: CalendarDays,
    hint: "Registered for an event",
    question: "Which events should start it?",
    narrowable: true,
  },
  {
    type: "resourceLeads",
    Icon: FileText,
    hint: "Downloaded a resource",
    question: "Which resources should start it?",
    narrowable: true,
  },
  {
    type: "freeCourseEnrolments",
    Icon: Users,
    hint: "Started a free course",
    question: "Which free courses should start it?",
    narrowable: true,
  },
  {
    type: "users",
    Icon: UserPlus,
    hint: "Created an account",
    question: "Anybody who creates an account.",
    narrowable: false,
  },
];
