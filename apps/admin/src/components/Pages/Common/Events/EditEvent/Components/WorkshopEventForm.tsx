"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Award, Users, Target, BookOpen } from "lucide-react";
import { uploadEventImage } from "@/services/Events/eventServices";

interface IconPoint {
  title: string;
  subtitles: string[]; // Changed to array of subtitles
}

interface WorkshopEventDetails {
  section2_iconPoints?: {
    sectionName?: string;
    points?: IconPoint[];
  };
  section3_coloredTags?: {
    sectionName?: string;
    names?: string[];
  };
  section4_Header?: {
    sectionName?: string;
    names?: string[];
  };
  whatsappLink?: {
    Link?: string;
    studentLink?: string;
    professionalLink?: string;
  };
  certificateSection?: {
    header?: string;
    subheading?: string;
    certificateUrl?: string;
  }
}

interface WorkshopEventFormProps {
  eventDetails: WorkshopEventDetails;
  setEventDetails: (details: WorkshopEventDetails) => void;
}

export function WorkshopEventForm({
  eventDetails,
  setEventDetails,
}: WorkshopEventFormProps) {
  const [currentExpertName, setCurrentExpertName] = useState("");
  const [currentBulletPoint, setCurrentBulletPoint] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string>("");

  // Initialize default structure if not exists
  React.useEffect(() => {
    const needsInitialization =
      !eventDetails.section2_iconPoints ||
      !eventDetails.section3_coloredTags ||
      !eventDetails.section4_Header ||
      !eventDetails.certificateSection ||
      !eventDetails.whatsappLink ;

    if (needsInitialization) {
      setEventDetails({
        ...eventDetails,
        section2_iconPoints: eventDetails.section2_iconPoints || {
          sectionName: "",
          points: [{ title: "", subtitles: [""] }],
        },
        section3_coloredTags: eventDetails.section3_coloredTags || {
          sectionName: "",
          names: [],
        },
        section4_Header: eventDetails.section4_Header || {
          sectionName: "",
          names: [],
        },
        whatsappLink: eventDetails.whatsappLink || { Link: "" },
        certificateSection: eventDetails.certificateSection || {
          header: "",
          subheading: "",
          certificateUrl: "",
        },
      });
    }
  }, []);

  const handleNestedChange = (section: string, field: string, value: any) => {
    setEventDetails({
      ...eventDetails,
      [section]: {
        ...eventDetails[section as keyof WorkshopEventDetails],
        [field]: value,
      },
    });
  };

  // Icon Points Functions
  const addIconPoint = () => {
    const currentPoints = eventDetails.section2_iconPoints?.points || [];
    setEventDetails({
      ...eventDetails,
      section2_iconPoints: {
        ...eventDetails.section2_iconPoints!,
        points: [...currentPoints, { title: "", subtitles: [""] }],
      },
    });
  };

  const updateIconPoint = (index: number, field: string, value: string) => {
    const currentPoints = eventDetails.section2_iconPoints?.points || [];
    const updatedPoints = currentPoints.map((point, i) =>
      i === index ? { ...point, [field]: value } : point
    );
    setEventDetails({
      ...eventDetails,
      section2_iconPoints: {
        ...eventDetails.section2_iconPoints!,
        points: updatedPoints,
      },
    });
  };

  const addSubtitle = (pointIndex: number) => {
    const currentPoints = eventDetails.section2_iconPoints?.points || [];
    const updatedPoints = currentPoints.map((point, i) =>
      i === pointIndex
        ? { ...point, subtitles: [...point.subtitles, ""] }
        : point
    );
    setEventDetails({
      ...eventDetails,
      section2_iconPoints: {
        ...eventDetails.section2_iconPoints!,
        points: updatedPoints,
      },
    });
  };

  const updateSubtitle = (
    pointIndex: number,
    subtitleIndex: number,
    value: string
  ) => {
    const currentPoints = eventDetails.section2_iconPoints?.points || [];
    const updatedPoints = currentPoints.map((point, i) =>
      i === pointIndex
        ? {
            ...point,
            subtitles: point.subtitles.map((subtitle, j) =>
              j === subtitleIndex ? value : subtitle
            ),
          }
        : point
    );
    setEventDetails({
      ...eventDetails,
      section2_iconPoints: {
        ...eventDetails.section2_iconPoints!,
        points: updatedPoints,
      },
    });
  };

  const removeSubtitle = (pointIndex: number, subtitleIndex: number) => {
    const currentPoints = eventDetails.section2_iconPoints?.points || [];
    const updatedPoints = currentPoints.map((point, i) =>
      i === pointIndex && point.subtitles.length > 1
        ? {
            ...point,
            subtitles: point.subtitles.filter((_, j) => j !== subtitleIndex),
          }
        : point
    );
    setEventDetails({
      ...eventDetails,
      section2_iconPoints: {
        ...eventDetails.section2_iconPoints!,
        points: updatedPoints,
      },
    });
  };

  const removeIconPoint = (index: number) => {
    const currentPoints = eventDetails.section2_iconPoints?.points || [];
    if (currentPoints.length > 1) {
      const updatedPoints = currentPoints.filter((_, i) => i !== index);
      setEventDetails({
        ...eventDetails,
        section2_iconPoints: {
          ...eventDetails.section2_iconPoints!,
          points: updatedPoints,
        },
      });
    }
  };

  // Expert Names Functions
  const addExpertName = () => {
    if (currentExpertName.trim()) {
      const currentNames = eventDetails.section3_coloredTags?.names || [];
      setEventDetails({
        ...eventDetails,
        section3_coloredTags: {
          ...eventDetails.section3_coloredTags!,
          names: [...currentNames, currentExpertName.trim()],
        },
      });
      setCurrentExpertName("");
    }
  };

  const removeExpertName = (index: number) => {
    const currentNames = eventDetails.section3_coloredTags?.names || [];
    const updatedNames = currentNames.filter((_, i) => i !== index);
    setEventDetails({
      ...eventDetails,
      section3_coloredTags: {
        ...eventDetails.section3_coloredTags!,
        names: updatedNames,
      },
    });
  };

  // Bullet Points Functions
  const addBulletPoint = () => {
    if (currentBulletPoint.trim()) {
      const currentNames = eventDetails.section4_Header?.names || [];
      setEventDetails({
        ...eventDetails,
        section4_Header: {
          ...eventDetails.section4_Header!,
          names: [...currentNames, currentBulletPoint.trim()],
        },
      });
      setCurrentBulletPoint("");
    }
  };

  const removeBulletPoint = (index: number) => {
    const currentNames = eventDetails.section4_Header?.names || [];
    const updatedNames = currentNames.filter((_, i) => i !== index);
    setEventDetails({
      ...eventDetails,
      section4_Header: {
        ...eventDetails.section4_Header!,
        names: updatedNames,
      },
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url: any = await uploadEventImage(file);
      console.log("Uploaded file URL:", url.fileUrl);
      setPreviewUrl(url.fileUrl);
      setEventDetails({
        ...eventDetails,
        certificateSection: {
          certificateUrl: url.fileUrl,
        },
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Section 2: What You'll Learn (Icon Points) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            What You'll Learn (Points)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2" htmlFor="section2Name">
              Section Name
            </Label>
            <Input
              id="section2Name"
              value={eventDetails.section2_iconPoints?.sectionName || ""}
              onChange={(e) =>
                handleNestedChange(
                  "section2_iconPoints",
                  "sectionName",
                  e.target.value
                )
              }
              placeholder="What You'll Learn"
            />
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-medium">Add Sub-Points</h4>
              <Button type="button" onClick={addIconPoint} size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Add Point
              </Button>
            </div>
            {eventDetails.section2_iconPoints?.points?.map(
              (point, pointIndex) => (
                <div
                  key={pointIndex}
                  className="border rounded-lg p-4 space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 mr-4">
                      <div className="mb-4">
                        <Label className="mb-2">Points</Label>
                        <Input
                          value={point.title}
                          onChange={(e) =>
                            updateIconPoint(pointIndex, "title", e.target.value)
                          }
                          placeholder="AI Fundamentals"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Label className="mb-2">Sub Points</Label>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => addSubtitle(pointIndex)}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Add Subtitle
                          </Button>
                        </div>
                        {point.subtitles?.map((subtitle, subtitleIndex) => (
                          <div key={subtitleIndex} className="flex gap-2">
                            <Input
                              value={subtitle}
                              onChange={(e) =>
                                updateSubtitle(
                                  pointIndex,
                                  subtitleIndex,
                                  e.target.value
                                )
                              }
                              placeholder="Understand the core concepts"
                            />
                            {point.subtitles.length > 1 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  removeSubtitle(pointIndex, subtitleIndex)
                                }
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => removeIconPoint(pointIndex)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            You'll Walk Away With
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2" htmlFor="section4Name">
              Section Name
            </Label>
            <Input
              id="section4Name"
              value={eventDetails.section4_Header?.sectionName || ""}
              onChange={(e) =>
                handleNestedChange(
                  "section4_Header",
                  "sectionName",
                  e.target.value
                )
              }
              placeholder={`Why Join This Workshop`}
            />
          </div>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={currentBulletPoint}
                onChange={(e) => setCurrentBulletPoint(e.target.value)}
                placeholder="Bullet point"
                onKeyPress={(e) =>
                  e.key === "Enter" && (e.preventDefault(), addBulletPoint())
                }
              />
              <Button type="button" onClick={addBulletPoint}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {eventDetails.section4_Header?.names?.map((name, index) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="flex items-center gap-1"
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => removeBulletPoint(index)}
                    className="ml-1 cursor-pointer hover:text-red-500"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Industry Experts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Who Should Attend
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2" htmlFor="section3Name">
              Section Name
            </Label>
            <Input
              id="section3Name"
              value={eventDetails.section3_coloredTags?.sectionName || ""}
              onChange={(e) =>
                handleNestedChange(
                  "section3_coloredTags",
                  "sectionName",
                  e.target.value
                )
              }
              placeholder="Industry Experts"
            />
          </div>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={currentExpertName}
                onChange={(e) => setCurrentExpertName(e.target.value)}
                placeholder="Expert name"
                onKeyPress={(e) =>
                  e.key === "Enter" && (e.preventDefault(), addExpertName())
                }
              />
              <Button type="button" onClick={addExpertName}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {eventDetails.section3_coloredTags?.names?.map((name, index) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="flex items-center gap-1"
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => removeExpertName(index)}
                    className="ml-1 cursor-pointer hover:text-red-500"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="w-5 h-5" />
            Certificate Section
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Header input */}
          <div>
            <Label className="mb-2" htmlFor="certificateHeader">
              Certificate Header
            </Label>
            <Input
              id="certificateHeader"
              value={eventDetails.certificateSection?.header || ""}
              onChange={(e) =>
                handleNestedChange(
                  "certificateSection",
                  "header",
                  e.target.value
                )
              }
              placeholder="Enter the heading..."
            />

            <Label className="mb-2 mt-4" htmlFor="certificatesubHeading">
              Certificate Subheading
            </Label>
            <Input
              id="certificatesubHeading"
              value={eventDetails.certificateSection?.subheading || ""}
              onChange={(e) =>
                handleNestedChange(
                  "certificateSection",
                  "subheading",
                  e.target.value
                )
              }
              placeholder="Enter the subheading..."
            />
          </div>

          {/* Certificate Upload */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Certificate *</Label>

            {/* Upload Button */}
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                id="certificate-upload"
              />
              <Label
                htmlFor="certificate-upload"
                className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
              >
                <Plus className="w-4 h-4 mr-2" />
                Upload Certificate
              </Label>
            </div>

            {/* Preview */}
            {(previewUrl ||
              eventDetails.certificateSection?.certificateUrl) && (
              <div className="w-fit h-52 border  overflow-hidden">
                <img
                  src={
                    previewUrl ||
                    eventDetails.certificateSection?.certificateUrl ||
                    ""
                  }
                  alt="Certificate Preview"
                  className="w-full h-full object-cover "
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp Link Section */}
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp Link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2" htmlFor="whatsappLink">
              WhatsApp Link
            </Label>
            <Input
              id="whatsappLink"
              value={eventDetails.whatsappLink?.Link || ""}
              onChange={(e) =>
                handleNestedChange("whatsappLink", "Link", e.target.value)
              }
              placeholder="Enter the WhatsApp link"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Default link — used when a Student/Professional link below is not
              set.
            </p>
          </div>
          <div>
            <Label className="mb-2" htmlFor="whatsappStudentLink">
              Student WhatsApp Link (optional)
            </Label>
            <Input
              id="whatsappStudentLink"
              value={eventDetails.whatsappLink?.studentLink || ""}
              onChange={(e) =>
                handleNestedChange("whatsappLink", "studentLink", e.target.value)
              }
              placeholder="Enter the WhatsApp link for Students"
            />
          </div>
          <div>
            <Label className="mb-2" htmlFor="whatsappProfessionalLink">
              Professional WhatsApp Link (optional)
            </Label>
            <Input
              id="whatsappProfessionalLink"
              value={eventDetails.whatsappLink?.professionalLink || ""}
              onChange={(e) =>
                handleNestedChange(
                  "whatsappLink",
                  "professionalLink",
                  e.target.value
                )
              }
              placeholder="Enter the WhatsApp link for Professionals"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
