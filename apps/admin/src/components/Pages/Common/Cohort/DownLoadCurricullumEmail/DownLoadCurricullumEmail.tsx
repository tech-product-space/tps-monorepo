"use client";

import { useState, useEffect } from "react";
import type React from "react";
import { useNotification } from "@/helpers/NotificationContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { uploadEventImage } from "@/services/Events/eventServices";
import {
  getCurriculumByName,
  postCurriculumByName,
} from "@/services/offers/offerServices";
import { Copy } from "lucide-react";
import EmailTextEditor3 from "@/components/Rich-Text-Editor/EmailTextEditor3";

export interface IProgramOffer {
  id?: number;
  program_name: "pm_fellowship" | "ai_for_pm" | "interview_course";
  subject: string;
  pdfFile?: any;
  pdfUrl?: any;
  body: string;
}

const defaultFormData: IProgramOffer = {
  program_name: "pm_fellowship",
  subject: "",
  pdfFile: null,
  pdfUrl: "",
  body: "",
};

export default function DownLoadCurricullumEmail() {
  const [activeTab, setActiveTab] = useState<
    "pm_fellowship" | "ai_for_pm" | "interview_course"
  >("pm_fellowship");

  const { showNotification } = useNotification();
  const [formData, setFormData] = useState<IProgramOffer>(defaultFormData);
  const [loading, setLoading] = useState(false);

  // 📌 Load curriculum when tab changes
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const data = await getCurriculumByName(activeTab);

        const curriculum = data?.downloadCurriculum || {};

        console.log("Curriculum : ", curriculum);

        setFormData({
          program_name: activeTab,
          subject: curriculum.subject || "",
          body: curriculum.body || "",
          pdfFile: null,
          pdfUrl:
            typeof curriculum.pdfUrl === "string"
              ? curriculum.pdfUrl
              : curriculum.pdfUrl?.fileUrl || "", // ✅ handle object/string
        });
      } catch (err) {
        console.error("Failed to load curriculum:", err);
        showNotification("error", "Failed to load curriculum", "");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [activeTab]);

  const handleTabChange = (value: string) => {
    let programName:
      | "pm_fellowship"
      | "ai_for_pm"
      | "interview_course"
      | undefined;

    if (value === "PM Fellowship") programName = "pm_fellowship";
    else if (value === "AI for PM") programName = "ai_for_pm";
    else if (value === "Interview Course") programName = "interview_course";

    if (programName) {
      setActiveTab(programName);
    }
  };

  const handleInputChange = (
    field: keyof IProgramOffer,
    value: string | number | Date | File | null
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value as any,
    }));
  };

  // 📌 Handles file selection + upload
  const handleResourcePDFUpload = async (file: File | null) => {
    if (!file) return;

    try {
      const uploaded: any = await uploadEventImage(file);
      setFormData((prev) => ({
        ...prev,
        pdfFile: file,
        pdfUrl: uploaded?.fileUrl,
      }));
      showNotification("success", "PDF Uploaded Successfully", "");
    } catch (err) {
      showNotification("error", "PDF Upload Failed", "");
      console.error("PDF Upload Error:", err);
    }
  };

  // 📌 Save curriculum
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const requestBody = {
      downloadCurriculum: {
        subject: formData.subject,
        body: formData.body,
        pdfUrl: formData.pdfUrl || "", // ✅ ensure string
      },
    };

    try {
      setLoading(true);
      await postCurriculumByName(activeTab, requestBody);

      showNotification("success", "Curriculum Saved", "");
    } catch (err) {
      console.error("Save Error:", err);
      showNotification("error", "Failed to save curriculum", "");
    } finally {
      setLoading(false);
    }
  };

  const getReadableProgramName = (key: string) => {
    return key === "pm_fellowship"
      ? "PM Fellowship"
      : key === "ai_for_pm"
      ? "AI for PM"
      : key === "interview_course"
      ? "Interview Course"
      : "";
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 overflow-y-auto h-screen">
      <Card>
        <CardHeader>
          <CardTitle>Curriculum Email for PDF</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs
            value={getReadableProgramName(activeTab)}
            onValueChange={handleTabChange}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="PM Fellowship">PM Fellowship</TabsTrigger>
              <TabsTrigger value="AI for PM">AI for PM</TabsTrigger>
              <TabsTrigger value="Interview Course">
                Interview Course
              </TabsTrigger>
            </TabsList>

            <TabsContent value="PM Fellowship" className="mt-6">
              <ProgramForm
                programName="PM Fellowship"
                formData={formData}
                onInputChange={handleInputChange}
                onFileChange={handleResourcePDFUpload}
                onSubmit={handleSubmit}
                loading={loading}
              />
            </TabsContent>

            <TabsContent value="AI for PM" className="mt-6">
              <ProgramForm
                programName="AI for PM"
                formData={formData}
                onInputChange={handleInputChange}
                onFileChange={handleResourcePDFUpload}
                onSubmit={handleSubmit}
                loading={loading}
              />
            </TabsContent>
            <TabsContent value="Interview Course" className="mt-6">
              <ProgramForm
                programName="Interview Course"
                formData={formData}
                onInputChange={handleInputChange}
                onFileChange={handleResourcePDFUpload}
                onSubmit={handleSubmit}
                loading={loading}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

interface ProgramFormProps {
  programName: string;
  formData: IProgramOffer;
  onInputChange: (
    field: keyof IProgramOffer,
    value: string | number | Date | File | null
  ) => void;
  onFileChange: (file: File | null) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading?: boolean;
}

function ProgramForm({
  programName,
  formData,
  onInputChange,
  onFileChange,
  onSubmit,
  loading,
}: ProgramFormProps) {
  const { showNotification } = useNotification();

const handleLinkCopy = (programName: string) => {
  if (!formData.pdfUrl) return;

  const fileName = formData.pdfUrl.split("/").pop();

  // Map program_name to its corresponding route
  const routeMap: Record<string, string> = {
    'AI for PM': "advanced-ai-program",
    'PM Fellowship': "product-management-fellowship",
    'Interview Course': "product-management-interview-preparation",
  };

  const basePath = routeMap[programName];
  if (!basePath) {
    console.error("Invalid program name:", programName);
    return;
  }

  const pdfUrl = `https://theproductspace.in/${basePath}/curriculum/${fileName}`;

  navigator.clipboard.writeText(pdfUrl);
  showNotification("success", "PDF Link Copied", "");
  console.log("PDF URL:", pdfUrl);
};

  console.log("PDF URL  : ", formData.pdfUrl);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="program_name">Program Name</Label>
          <Input
            id="program_name"
            value={programName}
            disabled
            className="bg-muted"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            type="text"
            placeholder="Enter subject"
            value={formData.subject}
            onChange={(e) => onInputChange("subject", e.target.value)}
          />
        </div>

        <div className="col-span-1 md:col-span-2 space-y-2">
          <EmailTextEditor3
            value={formData.body}
            onChange={(val: string) => onInputChange("body", val)}
          />
        </div>
      </div>
      <div className="flex justify-between">
        <div className="space-y-2">
          <Label htmlFor="pdf_upload">Upload PDF</Label>
          <Input
            id="pdf_upload"
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            className="px-15 bg-[#335DC8] hover:bg-[#335DC8]"
            onClick={() => document.getElementById("pdf_upload")?.click()}
          >
            {formData.pdfFile ? "Change PDF" : "Upload PDF"}
          </Button>

          {(formData.pdfFile || formData.pdfUrl) && (
            <div className="text-sm text-muted-foreground space-y-1">
              {formData.pdfFile && (
                <p>
                  Selected File: {Math.round(formData.pdfFile.size / 1024)} KB
                </p>
              )}
              {formData.pdfUrl && (
                <a
                  href={formData.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  View PDF
                </a>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="pdf_upload">Copy the Link </Label>
          <Button
            disabled={!formData.pdfUrl}
            variant="outline"
            onClick={() => handleLinkCopy(programName)}
          >
            Copy PDF Link
            <Copy className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex justify-end space-x-4">
        <Button
          onClick={onSubmit}
          disabled={loading}
          className="px-15 bg-[#335DC8] hover:bg-[#335DC8] cursor-pointer"
        >
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
