"use client";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  Layers,
  GitBranch,
  Gift,
  Users,
  Award,
} from "lucide-react";
import { uploadEventImage } from "@/services/Events/eventServices";
import TiptapEditor from "@/components/Pages/Common/SimpleEditor/SimpleEditor";

interface SubPoint {
  text: string;
}

interface CarouselPoint {
  title: string;
  subPoints: SubPoint[];
}

interface EventFlowItem {
  title: string;
  description: string;
}

interface ExclusiveBenefitItem {
  title: string;
  description: string;
}

interface ExclusiveBenefitBox {
  icon: string;
  description: string;
}

interface TeardownEventDetails {
  section1_carousel?: {
    sectionName?: string;
    points?: CarouselPoint[];
    note?: string;
    description?: string;
  };
  eventFlow?: {
    sectionName?: string;
    items?: EventFlowItem[];
  };
  exclusiveBenefits?: {
    sectionName?: string;
    firstPrize?: string;
    descriptionFirst?: string;
    descriptionSecond?: string;
    secondPrize?: string;
    thirdPrize?: string;
    items?: ExclusiveBenefitItem[];
    boxPoints?: ExclusiveBenefitBox[];
  };
  whoShouldAttend?: {
    sectionName?: string;
    names?: string[];
  };
  DetailHeader?: {
    Header?: string;
    Subtitle?: string;
  };
  certificateSection?: {
    header?: string;
    subheading?: string;
    certificateUrl?: string;
  };
  whatsappLink?: {
    Link?: string;
    studentLink?: string;
    professionalLink?: string;
  }
}

interface TeardownEventFormProps {
  eventDetails: TeardownEventDetails;
  setEventDetails: (details: TeardownEventDetails) => void;
  eventType: "Teardown" | "Hackathon";
}

export function TeardownEventForm({
  eventDetails,
  setEventDetails,
  eventType,
}: TeardownEventFormProps) {
  const [currentAttendee, setCurrentAttendee] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string>("");
  // Initialize default structure if not exists
  useEffect(() => {
    const needsInitialization =
      !eventDetails.section1_carousel ||
      !eventDetails.eventFlow ||
      !eventDetails.exclusiveBenefits ||
      !eventDetails.whoShouldAttend ||
      !eventDetails.DetailHeader ||
      !eventDetails.certificateSection ||
      !eventDetails.whatsappLink ;

    if (needsInitialization) {
      setEventDetails({
        ...eventDetails,
        section1_carousel: eventDetails.section1_carousel || {
          sectionName: "",
          points: [{ title: "", subPoints: [] }],
          note: "",
          description: "",
        },
        eventFlow: eventDetails.eventFlow || {
          sectionName: "",
          items: [{ title: "", description: "" }],
        },
        exclusiveBenefits: eventDetails.exclusiveBenefits || {
          sectionName: "",
          firstPrize: "",
          descriptionFirst: "",
          descriptionSecond: "",
          secondPrize: "",
          thirdPrize: "",
          items: [{ title: "", description: "" }],
          boxPoints: [{ icon: "", description: "" }],
        },
        whoShouldAttend: eventDetails.whoShouldAttend || {
          sectionName: "",
          names: [],
        },
        DetailHeader: eventDetails.DetailHeader || {
          Header: "",
          Subtitle: "",
        },
        certificateSection: eventDetails.certificateSection || {
          header: "",
          subheading: "",
          certificateUrl: "",
        },
        whatsappLink: eventDetails.whatsappLink || {
          Link: "",
        }
      });
    }
  }, []);

  const handleNestedChange = (section: string, field: string, value: any) => {
    setEventDetails({
      ...eventDetails,
      [section]: {
        ...eventDetails[section as keyof TeardownEventDetails],
        [field]: value,
      },
    });
  };

  // Carousel functions
  const addCarouselPoint = () => {
    const currentPoints = eventDetails.section1_carousel?.points || [];
    setEventDetails({
      ...eventDetails,
      section1_carousel: {
        ...eventDetails.section1_carousel!,
        points: [...currentPoints, { title: "", subPoints: [] }],
      },
    });
  };

  const updateCarouselPoint = (index: number, field: string, value: any) => {
    const currentPoints = eventDetails.section1_carousel?.points || [];
    const updatedPoints = currentPoints.map((point, i) =>
      i === index ? { ...point, [field]: value } : point
    );
    setEventDetails({
      ...eventDetails,
      section1_carousel: {
        ...eventDetails.section1_carousel!,
        points: updatedPoints,
      },
    });
  };

  const addSubPoint = (pointIndex: number) => {
    const currentPoints = eventDetails.section1_carousel?.points || [];
    const updatedPoints = currentPoints.map((point, i) =>
      i === pointIndex
        ? { ...point, subPoints: [...point.subPoints, { text: "" }] }
        : point
    );
    setEventDetails({
      ...eventDetails,
      section1_carousel: {
        ...eventDetails.section1_carousel!,
        points: updatedPoints,
      },
    });
  };

  const updateSubPoint = (
    pointIndex: number,
    subPointIndex: number,
    value: string
  ) => {
    const currentPoints = eventDetails.section1_carousel?.points || [];
    const updatedPoints = currentPoints.map((point, i) =>
      i === pointIndex
        ? {
            ...point,
            subPoints: point.subPoints.map((subPoint, j) =>
              j === subPointIndex ? { text: value } : subPoint
            ),
          }
        : point
    );
    setEventDetails({
      ...eventDetails,
      section1_carousel: {
        ...eventDetails.section1_carousel!,
        points: updatedPoints,
      },
    });
  };

  const removeCarouselPoint = (index: number) => {
    const currentPoints = eventDetails.section1_carousel?.points || [];
    if (currentPoints.length > 1) {
      const updatedPoints = currentPoints.filter((_, i) => i !== index);
      setEventDetails({
        ...eventDetails,
        section1_carousel: {
          ...eventDetails.section1_carousel!,
          points: updatedPoints,
        },
      });
    }
  };

  const removeSubPoint = (pointIndex: number, subPointIndex: number) => {
    const currentPoints = eventDetails.section1_carousel?.points || [];
    const updatedPoints = currentPoints.map((point, i) =>
      i === pointIndex
        ? {
            ...point,
            subPoints: point.subPoints.filter((_, j) => j !== subPointIndex),
          }
        : point
    );
    setEventDetails({
      ...eventDetails,
      section1_carousel: {
        ...eventDetails.section1_carousel!,
        points: updatedPoints,
      },
    });
  };

  // Event Flow functions
  const addEventFlowItem = () => {
    const currentItems = eventDetails.eventFlow?.items || [];
    setEventDetails({
      ...eventDetails,
      eventFlow: {
        ...eventDetails.eventFlow!,
        items: [...currentItems, { title: "", description: "" }],
      },
    });
  };

  const updateEventFlowItem = (index: number, field: string, value: string) => {
    const currentItems = eventDetails.eventFlow?.items || [];
    const updatedItems = currentItems.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    );
    setEventDetails({
      ...eventDetails,
      eventFlow: {
        ...eventDetails.eventFlow!,
        items: updatedItems,
      },
    });
  };

  const removeEventFlowItem = (index: number) => {
    const currentItems = eventDetails.eventFlow?.items || [];
    if (currentItems.length > 1) {
      const updatedItems = currentItems.filter((_, i) => i !== index);
      setEventDetails({
        ...eventDetails,
        eventFlow: {
          ...eventDetails.eventFlow!,
          items: updatedItems,
        },
      });
    }
  };

  // Exclusive Benefits functions
  const addExclusiveBenefitItem = () => {
    const currentItems = eventDetails.exclusiveBenefits?.items || [];
    setEventDetails({
      ...eventDetails,
      exclusiveBenefits: {
        ...eventDetails.exclusiveBenefits!,
        items: [...currentItems, { title: "", description: "" }],
      },
    });
  };

  const updateExclusiveBenefitItem = (
    index: number,
    field: string,
    value: string
  ) => {
    const currentItems = eventDetails.exclusiveBenefits?.items || [];
    const updatedItems = currentItems.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    );
    setEventDetails({
      ...eventDetails,
      exclusiveBenefits: {
        ...eventDetails.exclusiveBenefits!,
        items: updatedItems,
      },
    });
  };

  const removeExclusiveBenefitItem = (index: number) => {
    const currentItems = eventDetails.exclusiveBenefits?.items || [];
    if (currentItems.length > 1) {
      const updatedItems = currentItems.filter((_, i) => i !== index);
      setEventDetails({
        ...eventDetails,
        exclusiveBenefits: {
          ...eventDetails.exclusiveBenefits!,
          items: updatedItems,
        },
      });
    }
  };

  const addExclusiveBenefitBoxItem = () => {
    const currentItems = eventDetails.exclusiveBenefits?.boxPoints || [];
    setEventDetails({
      ...eventDetails,
      exclusiveBenefits: {
        ...eventDetails.exclusiveBenefits!,
        boxPoints: [...currentItems, { icon: "", description: "" }],
      },
    });
  };

  const updateExclusiveBenefitBoxItem = (
    index: number,
    field: string,
    value: string
  ) => {
    const currentItems = eventDetails.exclusiveBenefits?.boxPoints || [];
    const updatedItems = currentItems.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    );
    setEventDetails({
      ...eventDetails,
      exclusiveBenefits: {
        ...eventDetails.exclusiveBenefits!,
        boxPoints: updatedItems,
      },
    });
  };

  const removeExclusiveBenefitBoxItem = (index: number) => {
    const currentItems = eventDetails.exclusiveBenefits?.boxPoints || [];
    if (currentItems.length > 1) {
      const updatedItems = currentItems.filter((_, i) => i !== index);
      setEventDetails({
        ...eventDetails,
        exclusiveBenefits: {
          ...eventDetails.exclusiveBenefits!,
          boxPoints: updatedItems,
        },
      });
    }
  };

  // Who Should Attend functions
  const addAttendee = () => {
    if (currentAttendee.trim()) {
      const currentNames = eventDetails.whoShouldAttend?.names || [];
      setEventDetails({
        ...eventDetails,
        whoShouldAttend: {
          ...eventDetails.whoShouldAttend!,
          names: [...currentNames, currentAttendee.trim()],
        },
      });
      setCurrentAttendee("");
    }
  };

  const removeAttendee = (index: number) => {
    const currentNames = eventDetails.whoShouldAttend?.names || [];
    const updatedNames = currentNames.filter((_, i) => i !== index);
    setEventDetails({
      ...eventDetails,
      whoShouldAttend: {
        ...eventDetails.whoShouldAttend!,
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
      {/* Detail Header Section */}
      <Card>
        <CardHeader>
          <CardTitle>Detail Section Header</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2" htmlFor="detailHeader">
              Header
            </Label>
            <Input
              id="detailHeader"
              value={eventDetails.DetailHeader?.Header || ""}
              onChange={(e) =>
                handleNestedChange("DetailHeader", "Header", e.target.value)
              }
              placeholder="Enter the header"
            />
          </div>
          <div>
            <Label className="mb-2" htmlFor="Subtitle">
              Description
            </Label>
            <TiptapEditor
              content={eventDetails.DetailHeader?.Subtitle || ""}
              onChange={(value) =>
                handleNestedChange("DetailHeader", "Subtitle", value)
              }
              placeholder="Enter the Subtitle"
              showHeadings={false}
            />
          </div>
        </CardContent>
      </Card>

      {/* Why Join this workshop */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Why Join This Workshop?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2" htmlFor="section1Name">
              Section Name
            </Label>
            <Input
              id="section1Name"
              value={eventDetails.section1_carousel?.sectionName || ""}
              onChange={(e) =>
                handleNestedChange(
                  "section1_carousel",
                  "sectionName",
                  e.target.value
                )
              }
              placeholder="Teardown Overview"
            />
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-medium">Bullet Points</h4>
              <Button type="button" onClick={addCarouselPoint} size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Add Point
              </Button>
            </div>
            {eventDetails.section1_carousel?.points?.map(
              (point, pointIndex) => (
                <div
                  key={pointIndex}
                  className="border rounded-lg p-4 space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 mr-4">
                      <Label className="mb-2">Point Title</Label>
                      <Input
                        value={point.title}
                        onChange={(e) =>
                          updateCarouselPoint(
                            pointIndex,
                            "title",
                            e.target.value
                          )
                        }
                        placeholder="Step-by-step guidance"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => removeCarouselPoint(pointIndex)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label className="mb-2">Sub Points</Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => addSubPoint(pointIndex)}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add Sub Point
                      </Button>
                    </div>
                    {point.subPoints?.map((subPoint, subIndex) => (
                      <div key={subIndex} className="flex gap-2">
                        <Input
                          value={subPoint.text}
                          onChange={(e) =>
                            updateSubPoint(pointIndex, subIndex, e.target.value)
                          }
                          placeholder="From ideation to MVP"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeSubPoint(pointIndex, subIndex)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>

          <h4 className="font-medium">Note and Description</h4>
          <Card>
            <CardContent className="space-y-4">
              <div className="">
                <Label className="mb-2" htmlFor="note">
                  Note
                </Label>
                <Input
                  id="note"
                  value={eventDetails.section1_carousel?.note || ""}
                  onChange={(e) =>
                    handleNestedChange(
                      "section1_carousel",
                      "note",
                      e.target.value
                    )
                  }
                  placeholder="Enter the note"
                />
              </div>
              <div className="">
                <Label className="mb-2" htmlFor="description">
                  Description
                </Label>
                <Input
                  id="description"
                  value={eventDetails.section1_carousel?.description || ""}
                  onChange={(e) =>
                    handleNestedChange(
                      "section1_carousel",
                      "description",
                      e.target.value
                    )
                  }
                  placeholder="Enter the note"
                />
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      {/* Event Flow Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Event Flow
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2" htmlFor="eventFlowSectionName">
              Section Name
            </Label>
            <Input
              id="eventFlowSectionName"
              value={eventDetails.eventFlow?.sectionName || ""}
              onChange={(e) =>
                handleNestedChange("eventFlow", "sectionName", e.target.value)
              }
              placeholder="Event Flow"
            />
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-medium">Flow Items</h4>
              <Button type="button" onClick={addEventFlowItem} size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Add Flow Item
              </Button>
            </div>
            {eventDetails.eventFlow?.items?.map((item, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1 mr-4 space-y-3">
                    <div>
                      <Label className="mb-2">Title</Label>
                      <Input
                        value={item.title}
                        onChange={(e) =>
                          updateEventFlowItem(index, "title", e.target.value)
                        }
                        placeholder="Registration & Welcome"
                      />
                    </div>
                    <div>
                      <Label className="mb-2">Description</Label>
                      <Input
                        value={item.description}
                        onChange={(e) =>
                          updateEventFlowItem(
                            index,
                            "description",
                            e.target.value
                          )
                        }
                        placeholder="Participants register and receive welcome materials"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => removeEventFlowItem(index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Exclusive Benefits Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5" />
            Exclusive Benefits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-medium">Box Information</h4>
              <Button
                type="button"
                onClick={addExclusiveBenefitBoxItem}
                size="sm"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Benefit
              </Button>
            </div>
            {eventDetails.exclusiveBenefits?.boxPoints?.map((item, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1 mr-4 space-y-3">
                    <div>
                      <Label className="mb-2">Icon</Label>
                      <Input
                        value={item.icon}
                        onChange={(e) =>
                          updateExclusiveBenefitBoxItem(
                            index,
                            "icon",
                            e.target.value
                          )
                        }
                        placeholder="Icon Name from Lucide React"
                      />
                    </div>
                    <div>
                      <Label className="mb-2">Description</Label>
                      <Textarea
                        value={item.description}
                        onChange={(e) =>
                          updateExclusiveBenefitBoxItem(
                            index,
                            "description",
                            e.target.value
                          )
                        }
                        placeholder="Description"
                        className="min-h-[80px]"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => removeExclusiveBenefitBoxItem(index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div>
            <Label className="mb-2" htmlFor="exclusiveBenefitsSectionName">
              Section Name
            </Label>
            <Input
              id="exclusiveBenefitsSectionName"
              value={eventDetails.exclusiveBenefits?.sectionName || ""}
              onChange={(e) =>
                handleNestedChange(
                  "exclusiveBenefits",
                  "sectionName",
                  e.target.value
                )
              }
              placeholder="Exclusive Benefits"
            />
          </div>

          {/* Prize Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="mb-2" htmlFor="firstPrize">
                1st Prize
              </Label>
              <Input
                id="firstPrize"
                value={eventDetails.exclusiveBenefits?.firstPrize || ""}
                onChange={(e) =>
                  handleNestedChange(
                    "exclusiveBenefits",
                    "firstPrize",
                    e.target.value
                  )
                }
                placeholder="10,000"
              />
            </div>
            <div>
              <Label className="mb-2" htmlFor="secondPrize">
                2nd Prize
              </Label>
              <Input
                id="secondPrize"
                value={eventDetails.exclusiveBenefits?.secondPrize || ""}
                onChange={(e) =>
                  handleNestedChange(
                    "exclusiveBenefits",
                    "secondPrize",
                    e.target.value
                  )
                }
                placeholder="5,000"
              />
            </div>
            <div>
              <Label className="mb-2" htmlFor="thirdPrize">
                3rd Prize
              </Label>
              <Input
                id="thirdPrize"
                value={eventDetails.exclusiveBenefits?.thirdPrize || ""}
                onChange={(e) =>
                  handleNestedChange(
                    "exclusiveBenefits",
                    "thirdPrize",
                    e.target.value
                  )
                }
                placeholder="2,500"
              />
            </div>
          </div>

          {/* Description  */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-2" htmlFor="descriptionFirst">
                Description First
              </Label>
              <Textarea
                id="descriptionFirst"
                className="w-full h-[100px]"
                value={eventDetails.exclusiveBenefits?.descriptionFirst || ""}
                onChange={(e) =>
                  handleNestedChange(
                    "exclusiveBenefits",
                    "descriptionFirst",
                    e.target.value
                  )
                }
                placeholder="text"
              />
            </div>
            <div>
              <Label className="mb-2" htmlFor="descriptionSecond">
                Description Second
              </Label>
              <Textarea
                id="descriptionSecond"
                className="w-full h-[100px]"
                value={eventDetails.exclusiveBenefits?.descriptionSecond || ""}
                onChange={(e) =>
                  handleNestedChange(
                    "exclusiveBenefits",
                    "descriptionSecond",
                    e.target.value
                  )
                }
                placeholder="text"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-medium">Additional Benefits</h4>
              <Button type="button" onClick={addExclusiveBenefitItem} size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Add Benefit
              </Button>
            </div>
            {eventDetails.exclusiveBenefits?.items?.map((item, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1 mr-4 space-y-3">
                    <div>
                      <Label className="mb-2">Title</Label>
                      <Input
                        value={item.title}
                        onChange={(e) =>
                          updateExclusiveBenefitItem(
                            index,
                            "title",
                            e.target.value
                          )
                        }
                        placeholder="Networking Opportunities"
                      />
                    </div>
                    <div>
                      <Label className="mb-2">Description</Label>
                      <Textarea
                        value={item.description}
                        onChange={(e) =>
                          updateExclusiveBenefitItem(
                            index,
                            "description",
                            e.target.value
                          )
                        }
                        placeholder="Connect with industry leaders and potential collaborators"
                        className="min-h-[80px]"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => removeExclusiveBenefitItem(index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Who Should Attend Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Who Should Attend
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2" htmlFor="whoShouldAttendSectionName">
              Section Name
            </Label>
            <Input
              id="whoShouldAttendSectionName"
              value={eventDetails.whoShouldAttend?.sectionName || ""}
              onChange={(e) =>
                handleNestedChange(
                  "whoShouldAttend",
                  "sectionName",
                  e.target.value
                )
              }
              placeholder="Who Should Attend"
            />
          </div>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={currentAttendee}
                onChange={(e) => setCurrentAttendee(e.target.value)}
                placeholder="Target audience"
                onKeyPress={(e) =>
                  e.key === "Enter" && (e.preventDefault(), addAttendee())
                }
              />
              <Button type="button" onClick={addAttendee}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {eventDetails.whoShouldAttend?.names?.map((name, index) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="flex items-center gap-1"
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => removeAttendee(index)}
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
