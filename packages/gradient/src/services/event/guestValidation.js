import { EVENT_ATTENDEE_TYPE } from "../../config/constants/eventGuest.js";

/**
 * The conditional bits of a guest record: professionals owe us a role,
 * students a college and a year.
 *
 * Shared so the feedback-path registration cannot drift from the normal event
 * join — they collect the same fields and write to the same table, and two
 * copies of this would quietly diverge the first time a field is added.
 *
 * @returns {string|null} error message, or null if valid
 */
export const validateGuestDetails = ({
  name,
  email,
  phone,
  attendeeType,
  role,
  collegeName,
  graduationYear,
}) => {
  if (!name || !email || !phone || !attendeeType) {
    return "Name, email, phone and attendeeType are required";
  }

  if (!Object.values(EVENT_ATTENDEE_TYPE).includes(attendeeType)) {
    return "Invalid attendeeType";
  }

  if (attendeeType === EVENT_ATTENDEE_TYPE.PROFESSIONAL && !role) {
    return "Role is required for professionals";
  }

  if (
    attendeeType === EVENT_ATTENDEE_TYPE.STUDENT &&
    (!collegeName || !graduationYear)
  ) {
    return "College name and graduation year are required for students";
  }

  return null;
};

/**
 * Professionals have no college; students have no role. Strip the branch that
 * does not apply so a half-filled form does not persist stale values from
 * whichever type the user picked first.
 */
export const stripInapplicableGuestFields = (payload) => {
  const next = { ...payload };

  if (next.attendeeType === EVENT_ATTENDEE_TYPE.PROFESSIONAL) {
    delete next.collegeName;
    delete next.graduationYear;
  } else {
    delete next.role;
  }

  return next;
};
