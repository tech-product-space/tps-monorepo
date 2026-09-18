export const PREDEFINED_TYPES = [
  "ai-for-pm-enrollments",
  "ai-for-pm-download-curriculum",
  "ai-for-pm-scholarship",
  "pm-fellowship-enrollments",
  "pm-fellowship-download-curriculum",
  "interview-course-download-curriculum",
  "interview-course-enrollments",
  "free-course-enrollments",
  "gen-ai-enrollments",
  "gen-ai-download-curriculum",
  "gen-ai-contact-us",
  "ai-for-product-leaders-enrollments",
  "ai-for-product-leaders-download-curriculum",
  "ai-for-product-leaders-contact-us",
  "contact-us",
  "request-callback",
];

export const GROUPED_TYPES = [
  {
    id: "ai-for-pm",
    label: "Advanced AI Program",
    types: [
      { id: "ai-for-pm-enrollments", label: "Enrollments Only" },
      { id: "ai-for-pm-download-curriculum", label: "Download Curriculum" },
      { id: "ai-for-pm-scholarship", label: "Scholarship Applications" },
    ],
  },
  {
    id: "pm-fellowship",
    label: "PM Fellowship",
    types: [
      { id: "pm-fellowship-enrollments", label: "Enrollments Only" },
      { id: "pm-fellowship-download-curriculum", label: "Download Curriculum" },
    ],
  },
  {
    id: "interview-course",
    label: "Interview Course",
    types: [
      { id: "interview-course-enrollments", label: "Enrollments Only" },
      {
        id: "interview-course-download-curriculum",
        label: "Download Curriculum",
      },
    ],
  },
  {
    id: "free-course",
    label: "Free Course",
    types: [{ id: "free-course-enrollments", label: "Enrollments Only" }],
  },
  {
    id: "gen-ai",
    label: "GenAI",
    types: [
      { id: "gen-ai-enrollments", label: "Enrollments Only" },
      { id: "gen-ai-download-curriculum", label: "Download Curriculum" },
      { id: "gen-ai-contact-us", label: "Contact Us" },
    ],
  },
  {
    id: "ai-for-product-leaders",
    label: "AI for Product Leaders",
    types: [
      { id: "ai-for-product-leaders-enrollments", label: "Enrollments Only" },
      {
        id: "ai-for-product-leaders-download-curriculum",
        label: "Download Curriculum",
      },
      { id: "ai-for-product-leaders-contact-us", label: "Contact Us" },
    ],
  },
  {
    id: "contact-us",
    label: "Contact Us",
    types: [{ id: "contact-us", label: "Contact Us" }],
  },
  {
    id: "request-callback",
    label: "Request Callback",
    types: [{ id: "request-callback", label: "Request Callback" }],
  },
];
