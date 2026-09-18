"use client";

import { Input } from "@/components/ui/input";
import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  createResource,
  getResourcesById,
} from "@/services/resources/resourcesService";
import Image from "next/image";
import { useNotification } from "@/helpers/NotificationContext";
import EmailTextEditor3 from "@/components/Rich-Text-Editor/EmailTextEditor3";

export default function EmailTemplate() {
  const router = useRouter();
  const pathname = usePathname();
  const resourceId = pathname.split("/")[4];

  const [formData, setFormData] = useState({ subject: "", body: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const { showNotification } = useNotification();

  const fetchResourceInfo = async (id: string) => {
    setIsLoading(true);
    try {
      const response = await getResourcesById(id);
      setFormData({
        subject: response?.emailTemplate?.subject || "",
        body: response?.emailTemplate?.body || "",
      });
    } catch (err) {
      console.error("Error fetching resource:", err);
      showNotification("error", "Error fetching resource", "");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: "subject" | "body", value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const stripHtml = (html: string) =>
    html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();

  const isCompletelyEmpty =
    !isLoading && !formData.subject.trim() && !stripHtml(formData.body);

  const handleSave = async () => {
    if (!formData.subject.trim() || !formData.body.trim()) {
      showNotification("error", "Subject and Body cannot be empty", "");
      return;
    }

    const payload = {
      id: resourceId,
      emailTemplate: {
        subject: formData.subject,
        body: formData.body,
      },
    };

    try {
      await createResource(payload);
      showNotification("success", "Email Template saved successfully", "");
      console.log("Saved data:", { resourceId, ...formData });
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save email:", err);
      showNotification("error", "Failed to save email", "");
    }
  };

  const convertTextToHtml = (text: string) => text.replace(/\n/g, "<br />");

  useEffect(() => {
    if (resourceId) fetchResourceInfo(resourceId);
  }, [resourceId]);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="px-6 h-18 flex py-3 justify-between items-center border-b bg-white shadow-sm ">
        <div className="flex items-center gap-3 ">
          <ArrowLeft
            className="h-5 w-5 cursor-pointer text-gray-600"
            onClick={() => router.back()}
          />
          <h1 className="text-xl font-semibold text-gray-800 ">
            Resource Email Template
          </h1>
        </div>

        <Button
          variant="outline"
          onClick={() => setIsEditing(!isEditing)}
          className="text-sm px-4 py-2"
        >
          {isEditing ? "Cancel" : "Edit"}
        </Button>
      </div>

      {/* Body */}
      <div className="p-6 space-y-8 overflow-y-auto">
        {isEditing ? (
          <>
            {/* Edit Mode */}
            <div className="space-y-6">
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-2">
                  Subject
                </label>
                <Input
                  value={formData.subject}
                  onChange={(e) => handleInputChange("subject", e.target.value)}
                  placeholder="Enter email subject"
                  className="shadow-sm bg-white"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-2">Body</label>
                <EmailTextEditor3
                  value={formData.body}
                  onChange={(val: string) => handleInputChange("body", val)}
                />
              </div>

              <div className="pt-2 pb-4 flex justify-end">
                <Button
                  onClick={handleSave}
                  className="px-6 py-2 bg-[#335DC8] hover:bg-[#335DC8] cursor-pointer w-44"
                >
                  Save
                </Button>
              </div>
            </div>
          </>
        ) : isCompletelyEmpty ? (
          // When BOTH subject and body are empty, show the placeholder image
          <div className="flex flex-col items-center justify-center">
            <Image
              src="/assets/noemailtemplate.png"
              alt="No email template"
              width={480}
              height={360}
              className="mx-auto rounded-xl"
              unoptimized
            />
          </div>
        ) : (
          <>
            {/* View Mode */}
            <div className="bg-white rounded-lg shadow-sm p-8 max-w-3xl mx-auto border border-gray-100">
              {/* Email Header */}
              <div className="border-b border-gray-100 pb-4 mb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-2xl font-semibold text-gray-900">
                      {formData.subject || "No subject"}
                    </h1>
                  </div>
                </div>
              </div>

              {/* Email Body */}
              <div className="prose prose-gray max-w-none">
                <div
                  className="text-gray-900 leading-relaxed whitespace-pre-wrap break-words"
                  dangerouslySetInnerHTML={{
                    __html:
                      convertTextToHtml(formData.body) ||
                      '<p class="text-gray-800 italic">No content</p>',
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
