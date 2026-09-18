"use client";

import { useEffect, useState } from "react";
import type React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNotification } from "@/helpers/NotificationContext";
import {
  getEnrollEmailByName,
  postEnrollEmailByName,
} from "@/services/offers/offerServices";
import EmailTextEditor3 from "@/components/Rich-Text-Editor/EmailTextEditor3";

export interface IProgramOffer {
  program_name:
    | "pm_fellowship"
    | "ai_for_pm"
    | "interview_course"
    | "free_course";
  subject: string;
  body: string;
}

const defaultFormData: IProgramOffer = {
  program_name: "pm_fellowship",
  subject: "",
  body: "",
};

export default function EnrolmentEmail() {
  const [activeTab, setActiveTab] = useState<
    "pm_fellowship" | "ai_for_pm" | "interview_course" | "free_course"
  >("pm_fellowship");

  const { showNotification } = useNotification();

  // Keep separate state for each tab, now includes interview_course
  const [formDataMap, setFormDataMap] = useState<{
    [key in
      | "pm_fellowship"
      | "ai_for_pm"
      | "interview_course"
      | "free_course"]: IProgramOffer;
  }>({
    pm_fellowship: defaultFormData,
    ai_for_pm: { ...defaultFormData, program_name: "ai_for_pm" },
    interview_course: { ...defaultFormData, program_name: "interview_course" },
    free_course: { ...defaultFormData, program_name: "free_course" },
  });

  const handleTabChange = (value: string) => {
    let programName:
      | "pm_fellowship"
      | "ai_for_pm"
      | "interview_course"
      | "free_course"
      | undefined;

    if (value === "PM Fellowship") programName = "pm_fellowship";
    else if (value === "AI for PM") programName = "ai_for_pm";
    else if (value === "Interview Course") programName = "interview_course";
    else if (value === "Free Course") programName = "free_course";

    if (programName) {
      setActiveTab(programName);
    }
  };

  const handleInputChange = (
    field: keyof IProgramOffer,
    value: string | number | Date | File | null
  ) => {
    setFormDataMap((prev) => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        [field]: value as any,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentFormData = formDataMap[activeTab];

    const requestBody = {
      enrollmentEmail: {
        subject: currentFormData.subject,
        body: currentFormData.body,
      },
    };

    try {
      await postEnrollEmailByName(activeTab, requestBody);
      showNotification("success", "Email Updated Successfully", "");
    } catch (error) {
      console.error("[Program Offer Save Error]", error);
      showNotification("error", "Some Error Occurred", "");
    }
  };

  const getReadableProgramName = (key: string) => {
    return key === "pm_fellowship"
      ? "PM Fellowship"
      : key === "ai_for_pm"
      ? "AI for PM"
      : key === "interview_course"
      ? "Interview Course"
      : key === "free_course"
      ? "Free Course"
      : "";
  };

  const getSavedData = async (
    program_name:
      | "pm_fellowship"
      | "ai_for_pm"
      | "interview_course"
      | "free_course"
  ) => {
    try {
      const response = await getEnrollEmailByName(program_name);
      if (response && response.enrollmentEmail) {
        setFormDataMap((prev) => ({
          ...prev,
          [program_name]: {
            program_name,
            subject: response.enrollmentEmail.subject,
            body: response.enrollmentEmail.body,
          },
        }));
      }
    } catch (error) {
      console.error("[Fetch Saved Data Error]", error);
    }
  };

  // Fetch saved data whenever the active tab changes
  useEffect(() => {
    getSavedData(activeTab);
  }, [activeTab]);

  return (
    <div className="w-full max-w-7xl mx-auto p-6 overflow-y-auto h-screen">
      <Card>
        <CardHeader>
          <CardTitle>Cohort Enrolment Email</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs
            value={getReadableProgramName(activeTab)}
            onValueChange={handleTabChange}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="PM Fellowship">PM Fellowship</TabsTrigger>
              <TabsTrigger value="AI for PM">AI for PM</TabsTrigger>
              <TabsTrigger value="Interview Course">
                Interview Course
              </TabsTrigger>
              <TabsTrigger value="Free Course">Free Course</TabsTrigger>
            </TabsList>

            <TabsContent value="PM Fellowship" className="mt-6">
              <ProgramForm
                programName="PM Fellowship"
                formData={formDataMap.pm_fellowship}
                onInputChange={handleInputChange}
                onSubmit={handleSubmit}
              />
            </TabsContent>

            <TabsContent value="AI for PM" className="mt-6">
              <ProgramForm
                programName="AI for PM"
                formData={formDataMap.ai_for_pm}
                onInputChange={handleInputChange}
                onSubmit={handleSubmit}
              />
            </TabsContent>

            <TabsContent value="Interview Course" className="mt-6">
              <ProgramForm
                programName="Interview Course"
                formData={formDataMap.interview_course}
                onInputChange={handleInputChange}
                onSubmit={handleSubmit}
              />
            </TabsContent>
            <TabsContent value="Free Course" className="mt-6">
              <ProgramForm
                programName="Free Course"
                formData={formDataMap.free_course}
                onInputChange={handleInputChange}
                onSubmit={handleSubmit}
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
  onSubmit: (e: React.FormEvent) => void;
}

function ProgramForm({
  programName,
  formData,
  onInputChange,
  onSubmit,
}: ProgramFormProps) {
  console.log("Form Body : ", formData.body);
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

      <div className="flex justify-end space-x-4">
        <Button
          className="px-15 bg-[#335DC8] hover:bg-[#335DC8] cursor-pointer"
          onClick={onSubmit}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
