import React from "react";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, Mail } from "lucide-react";
import { useNotification } from "@/helpers/NotificationContext";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface OverviewProps {
  resourceData: any;
}

export default function Overview({ resourceData }: OverviewProps) {
  const { showNotification } = useNotification();
const pathname = usePathname()

console.log("Pathname : " , pathname)
  if (!resourceData) return <div>No resource data available</div>;

  const {
    title,
    subtitle,
    resourceCategory,
    resourceType,
    tagPrimary,
    tagSecondary,
    thumbnail,
    isPublished,
    createdAt,
    updatedAt,
  } = resourceData;

  const metaInfo = [
    { label: "Category", value: resourceCategory },
    { label: "Type", value: resourceType },
    { label: "Primary Tag", value: tagPrimary?.join(", ") },
    { label: "Secondary Tag", value: tagSecondary?.join(", ") },
    { label: "Published", value: isPublished ? "Yes" : "No" },
    { label: "Created At", value: new Date(createdAt).toLocaleString() },
    { label: "Updated At", value: new Date(updatedAt).toLocaleString() },
  ];

  const resourcePdfLink = resourceData?.resourceDetails?.resourcePdf
    ?.split("/")
    .pop();


  const handleLinkCopy = () => {
    if (!resourceData?.title || !resourceData?.id) return;
    const pdfUrl = `https://theproductspace.in/resources/${resourceData?.resourceSlug}/${resourcePdfLink}`;
    navigator.clipboard.writeText(pdfUrl);

    showNotification("success", "PDF Link Copied", "");
  };

  return (
    <>
      {/* Resource Overview */}
      <div className="p-6 space-y-6 border rounded-lg bg-white shadow">
      
        <div className="flex items-start gap-4">
          <img
            src={thumbnail}
            alt={title}
            className="w-[500px] h-full object-cover rounded-lg border"
          />
          <div className="flex flex-col justify-center space-y-4 h-[280px]">
            <h1 className="text-4xl font-bold">{title}</h1>
            <p className="text-xl text-gray-600">{subtitle}</p>
            <div className="flex gap-3">
              <Button
                disabled={!resourceData?.resourceDetails?.resourcePdf}
                onClick={handleLinkCopy}
                className="cursor-pointer"
              >
                Copy PDF Link
                <Copy className="w-4 h-4" />
              </Button>

              <Button
                className="w-fit flex items-center gap-2 px-4 py-2 rounded-lg shadow-sm cursor-pointer"
                onClick={() => {
                  if (!resourceData?.title || !resourceData?.id) return; // guard against undefined
                  const url = `https://staging-product-space-ui.vercel.app/resources/${resourceData?.title?.replace(
                    /\s+/g,
                    "-"
                  )}-${resourceData?.id}`;
                  window.open(url, "_blank");
                }}
              >
                View Resource
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Meta Info */}
        <div className="grid grid-cols-2 gap-4 text-xl text-black">
          {metaInfo.map(({ label, value }, idx) => (
            <p key={idx}>
              <strong className="text-xl">{label}:</strong> {value || "—"}
            </p>
          ))}
        </div>
      </div>


      {/* Email Section */}
      <div className="p-6 rounded-xl border bg-card text-card-foreground shadow-sm mt-6">
        <h2 className="text-2xl text-black font-semibold">
          Resource Access Email
        </h2>
        <p className="text-lg  text-slate-800 mt-2">
          When users access this resource, they will receive an email containing
          the provided subject, body content, and a link to the resource. You
          can customize this message to suit your needs.
        </p>
        <Link href={`${pathname}/email-template`}>
          <Button
            className="mt-4 flex items-center gap-2 cursor-pointer"
          >
            <Mail className="w-4 h-4" />
            Customize Email
          </Button>
        </Link>
      </div>
    </>
  );
}
