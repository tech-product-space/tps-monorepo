export const statusOptions = [
  "Not interested",
  "Positive",
  "Hot Lead",
  "Next Cohort",
  "Paid",
];

export const getStatusVariant = (status: string) => {
  switch (status) {
    case "Hot Lead":
      return "destructive";
    case "Paid":
      return "default";
    case "Positive":
      return "secondary";
    case "Next Cohort":
      return "outline";
    case "Not interested":
      return "secondary";
    default:
      return "secondary";
  }
};

