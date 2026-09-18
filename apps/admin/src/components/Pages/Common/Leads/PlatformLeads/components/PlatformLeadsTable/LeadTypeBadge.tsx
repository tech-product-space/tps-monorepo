import { Badge } from "@/components/ui/badge";
import clsx from "clsx";

type LeadTypeBadgeProps = {
  type: string;
};

type BadgeConfig = {
  label: string;
  className: string;
};

const STATIC_TYPE_MAP: Record<string, BadgeConfig> = {
  "request-callback": {
    label: "Request Callback",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200",
  },
  "contact-us": {
    label: "Contact Us",
    className: "bg-gray-100 text-gray-700 border-gray-200",
  },
  "gen-ai-contact-us": {
    label: "Gen AI Contact Form",
    className: "bg-gray-100 text-gray-700 border-gray-200",
  },
  "ai-for-product-leaders-contact-us": {
    label: "AI For Product Leaders Contact Form",
    className: "bg-gray-100 text-gray-700 border-gray-200",
  },
};

function resolveBadge(type: string): BadgeConfig {
  if (!type) {
    return {
      label: "Unknown",
      className: "bg-gray-100 text-gray-700 border-gray-200",
    };
  }
  
  if (type.includes("enrollment")) {
    return {
      label: "Enrollment Form",
      className: "bg-green-100 text-green-800 border-green-200",
    };
  }

  if (type.includes("download")) {
    return {
      label: "Download Curriculum",
      className: "bg-blue-100 text-blue-800 border-blue-200",
    };
  }

  return (
    STATIC_TYPE_MAP[type] || {
      label: type,
      className: "bg-gray-100 text-gray-700 border-gray-200",
    }
  );
}

export default function LeadTypeBadge({ type }: LeadTypeBadgeProps) {
  const { label, className } = resolveBadge(type);

  return (
    <Badge
      variant="outline"
      className={clsx("font-medium", className)}
    >
      {label}
    </Badge>
  );
}
