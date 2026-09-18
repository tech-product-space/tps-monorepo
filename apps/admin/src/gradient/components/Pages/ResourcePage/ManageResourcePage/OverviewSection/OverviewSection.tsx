import { ResourceResponse } from "@/gradient/types/resource";
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Share2,
  Layers,
  Tag,
  User,
  Calendar,
} from "lucide-react";
import { resolveStorageUrl } from "@/gradient/lib/storage";
import { useRouter } from "next/navigation";
import MailingSection from "./MailingSection/MailingSection";

function formatDate(dateStr?: string) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getDay(dateStr?: string) {
  if (!dateStr) return null;
  return new Date(dateStr).getDate();
}

function getMonth(dateStr?: string) {
  if (!dateStr) return null;
  return new Date(dateStr)
    .toLocaleDateString("en-US", { month: "short" })
    .toUpperCase();
}

export default function OverviewSection({
  resource,
}: {
  resource: ResourceResponse;
}) {
  const router = useRouter();

  const displayDate =
    resource.updatedAt || resource.scheduledAt || resource.createdAt;
  const formattedDate = formatDate(displayDate);
  const day = getDay(displayDate);
  const month = getMonth(displayDate);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Large Resource Thumbnail/Preview */}
        <div className="relative w-fit overflow-hidden rounded-xl  bg-zinc-500 dark:bg-zinc-800 aspect-video lg:aspect-auto lg:min-h-[300px]">
          {resource.thumbnailSrc ? (
            <img
              src={resolveStorageUrl(resource.thumbnailSrc)}
              alt={resource.title}
              className="w-auto h-[450px] rounded-xl object-cover"
            />
          ) : (
            <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center gap-2">
              <FileText
                size={40}
                className="text-zinc-300 dark:text-zinc-600"
              />
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                No resource thumbnail
              </p>
            </div>
          )}

          {/* Status pill over image */}
          <div className="absolute top-3 left-3">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm ${
                resource.isPublished
                  ? "bg-emerald-500/90 text-white"
                  : "bg-amber-400/90 text-amber-900"
              }`}
            >
              {resource.isPublished ? (
                <CheckCircle2 size={11} />
              ) : (
                <AlertCircle size={11} />
              )}
              {resource.isPublished ? "Published" : "Draft"}
            </span>
          </div>
        </div>

        {/* Right: Quick Stats & Info Panel */}
        <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 flex flex-col gap-5">
          {/* Header */}
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-0.5">
              {resource.title}
            </h2>
            {resource.subtitle && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 line-clamp-2">
                {resource.subtitle}
              </p>
            )}
          </div>

          <hr className="border-zinc-100 dark:border-zinc-800" />

          {/* Core Info */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Overview
            </p>

            {/* Date calendar block */}
            {day && month && (
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-11 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 text-center shadow-sm">
                  <div className="bg-zinc-800 dark:bg-zinc-700 text-white text-[10px] font-bold py-0.5 uppercase tracking-wider">
                    {month}
                  </div>
                  <div className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 text-lg font-bold leading-tight py-1">
                    {day}
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-200">
                    <Calendar size={13} className="text-zinc-400" />
                    {formattedDate}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    Last Updated
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2.5 mt-1">
              <span className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                <Layers size={13} className="text-zinc-400 flex-shrink-0" />
                {resource.resourceType || "N/A"}
              </span>
              <span className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                <Tag size={13} className="text-zinc-400 flex-shrink-0" />
                {resource.resourceCategory || "N/A"}
              </span>
            </div>
          </div>

          <hr className="border-zinc-100 dark:border-zinc-800" />

          {/* Authors */}
          {resource.authorDetails && resource.authorDetails.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Authors
              </p>
              <div className="flex flex-col gap-2.5">
                {resource.authorDetails.map((author, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    {author.imageKey ? (
                      <img
                        src={resolveStorageUrl(author.imageKey)}
                        alt={author.name}
                        className="w-6 h-6 rounded-full object-cover border border-zinc-200 dark:border-zinc-800"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                        <User size={12} className="text-zinc-400" />
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="text-[13px] font-medium leading-tight text-zinc-900 dark:text-zinc-100">
                        {author.name}
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        {author.designation} at {author.company}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <hr className="border-zinc-100 dark:border-zinc-800" />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-auto">
            <button
              onClick={() => router.push(`/resources/${resource.id}`)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg px-3 py-2 transition-colors"
            >
              <Pencil size={12} />
              Edit Resource
            </button>
            <button
              onClick={() =>
                window.open(
                  `${process.env.NEXT_PUBLIC_FRONTEND_URL}/resources/${resource.resourceSlug}`,
                  "_blank",
                )
              }
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg px-3 py-2 transition-colors"
            >
              <Share2 size={12} />
              Preview
            </button>
          </div>
        </div>
      </div>

      <MailingSection
        mailTemplate={resource.emailTemplate}
        resourceId={resource.id}
        pdfKey={resource.resourceDetails?.pdfLink?.split("/").pop()}
        resourceSlug={resource.resourceSlug}
      />
    </div>
  );
}
