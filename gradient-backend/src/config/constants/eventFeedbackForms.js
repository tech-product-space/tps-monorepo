/**
 * Feedback forms, one per eventType, defined once here.
 *
 * These are fixed — admins do not build or edit forms per event. The reason
 * they live here as data rather than as three React components (which is what
 * TPS does) is that the server needs the same definition the browser renders
 * from: to validate a submission, to name the export columns, and to know which
 * answers identify a teammate. A schema that exists only inside JSX can do none
 * of those.
 *
 * Adding a question to every workshop is an edit to this file. Adding one to a
 * single workshop is deliberately not supported.
 */

export const FEEDBACK_FIELD_TYPE = Object.freeze({
  SHORT_TEXT: "shortText",
  LONG_TEXT: "longText",
  RATING: "rating",
  SELECT: "select",
  MULTI_SELECT: "multiSelect",
  URL: "url",
  EMAIL: "email",
  PHONE: "phone",
  GROUP: "group",
});

/**
 * Marks a repeatable group as naming other people who earn a certificate.
 * The resolver looks for exactly this, so it is the one piece of semantics in
 * the schema — and it is what replaces TPS's server-invented `isPrimaryMember`
 * flag and its two-member ceiling.
 */
export const FEEDBACK_FIELD_ROLE = Object.freeze({
  TEAMMATE: "teammate",
});

const teamMembersField = {
  key: "teamMembers",
  label: "Other team members",
  help: "Add everyone who worked on this with you.",
  type: FEEDBACK_FIELD_TYPE.GROUP,
  role: FEEDBACK_FIELD_ROLE.TEAMMATE,
  repeatable: true,
  min: 0,
  max: 5,
  fields: [
    {
      key: "name",
      label: "Name",
      type: FEEDBACK_FIELD_TYPE.SHORT_TEXT,
      required: true,
      // Printed on their certificate, so it has to be a real name — even
      // though nothing on the form says so.
      minLength: 2,
      maxLength: 80,
    },
    {
      key: "email",
      label: "Email",
      type: FEEDBACK_FIELD_TYPE.EMAIL,
      required: true,
    },
    {
      key: "phone",
      label: "Phone",
      type: FEEDBACK_FIELD_TYPE.PHONE,
      required: false,
      /**
       * Names the sibling key holding the dial code. The renderer draws one
       * phone control that writes both, and skips the claimed key so it does
       * not also appear as a bare text box.
       *
       * Two keys rather than one combined string because validation, export
       * columns and any later lookup all want the number on its own — and
       * splitting "+919999900001" back apart afterwards means guessing where
       * the dial code ends.
       */
      countryCodeKey: "countryCode",
    },
    {
      key: "countryCode",
      label: "Country code",
      type: FEEDBACK_FIELD_TYPE.SHORT_TEXT,
      required: false,
    },
  ],
};

export const EVENT_FEEDBACK_FORMS = Object.freeze({
  Workshop: {
    title: "How did we do?",
    description: "Two minutes, and it genuinely shapes the next one.",
    fields: [
      {
        key: "rating",
        label: "How would you rate this session?",
        type: FEEDBACK_FIELD_TYPE.RATING,
        required: true,
        min: 1,
        max: 10,
      },
      {
        // The key stays `whatWorked` — it is the storage key inside
        // `responses`, and renaming it would orphan every answer already
        // submitted and blank that column in the export.
        key: "whatWorked",
        label: "Your feedback",
        type: FEEDBACK_FIELD_TYPE.LONG_TEXT,
        required: true,
        minLength: 5,
        maxLength: 2000,
      },
      {
        key: "improvements",
        label: "What could we do better?",
        type: FEEDBACK_FIELD_TYPE.LONG_TEXT,
        required: false,
        maxLength: 2000,
      },
      {
        key: "linkedinPostUrl",
        label: "LinkedIn Post Link (Mandatory for Workshop Certification)",
        type: FEEDBACK_FIELD_TYPE.URL,
        /**
         * Matching TPS exactly, including the mismatch: the label says
         * mandatory, the field is not. Nothing gates a certificate on it there
         * either — and here certificates auto-issue on submit, so leaving it
         * blank costs nothing. Set `required: true` if the label is meant to be
         * the rule.
         */
        required: false,
        // A post, not a profile — `linkedin.com/in/someone` is rejected. https
        // only, as in TPS.
        pattern: "^https://(www\\.)?linkedin\\.com/posts(/.*)?$",
        patternMessage: "Invalid Link",
      },
    ],
  },

  Hackathon: {
    title: "Submit your project",
    description:
      "One submission per team. Whoever submits lists the rest of the team.",
    fields: [
      {
        key: "teamName",
        label: "Team name",
        type: FEEDBACK_FIELD_TYPE.SHORT_TEXT,
        required: true,
        maxLength: 80,
      },
      teamMembersField,
      {
        key: "demoVideoUrl",
        label: "Demo video URL",
        type: FEEDBACK_FIELD_TYPE.URL,
        required: true,
      },
      {
        key: "projectUrl",
        label: "Project or repo link",
        type: FEEDBACK_FIELD_TYPE.URL,
        required: false,
      },
      {
        key: "projectCredentials",
        label: "Login details, if we need them to try it",
        type: FEEDBACK_FIELD_TYPE.LONG_TEXT,
        required: false,
        maxLength: 1000,
      },
      {
        key: "notes",
        label: "Anything else we should know?",
        type: FEEDBACK_FIELD_TYPE.LONG_TEXT,
        required: false,
        maxLength: 2000,
      },
    ],
  },

  Teardown: {
    title: "Submit your teardown",
    description:
      "One submission per team. Whoever submits lists the rest of the team.",
    fields: [
      {
        key: "teamName",
        label: "Team name",
        type: FEEDBACK_FIELD_TYPE.SHORT_TEXT,
        required: true,
        maxLength: 80,
      },
      teamMembersField,
      {
        key: "submissionUrl",
        label: "Submission link",
        help: "Deck, doc, or wherever your teardown lives.",
        type: FEEDBACK_FIELD_TYPE.URL,
        required: true,
      },
      {
        key: "notes",
        label: "Anything else we should know?",
        type: FEEDBACK_FIELD_TYPE.LONG_TEXT,
        required: false,
        maxLength: 2000,
      },
    ],
  },
});

export const getFeedbackForm = (eventType) =>
  EVENT_FEEDBACK_FORMS[eventType] || null;

/**
 * The group that names teammates, if this event type has one.
 * Used by the resolver and the team-duplicate guard so neither has to hardcode
 * the key "teamMembers".
 */
export const getTeammateField = (eventType) => {
  const form = getFeedbackForm(eventType);
  if (!form) return null;

  return (
    form.fields.find(
      (field) => field.role === FEEDBACK_FIELD_ROLE.TEAMMATE,
    ) || null
  );
};
