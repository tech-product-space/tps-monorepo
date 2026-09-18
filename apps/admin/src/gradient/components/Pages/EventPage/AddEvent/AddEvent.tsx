"use client";

import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/gradient/components/ui/card";
import { Input } from "@/gradient/components/ui/input";
import { Button } from "@/gradient/components/ui/button";
import { Label } from "@/gradient/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import { Loader2, Check, X } from "lucide-react";
import { useEventStore } from "@/gradient/lib/store/useEventStore";
import { eventService } from "@/gradient/services/eventService";
import { toast } from "sonner";
import { useSlugAvailability } from "@/gradient/hooks/useSlugAvailability";
import {
  EVENT_CATEGORIES,
  EventCategory,
} from "@/gradient/components/constants/eventCategories";
import { EVENT_TYPES, EventType } from "@/gradient/components/constants/eventTypes";

interface AddEventProps {
  onSuccess: () => void;
}

export default function AddEvent({ onSuccess }: AddEventProps) {
  const { setShowCreateForm } = useEventStore();

  const [formData, setFormData] = useState({
    eventTitle: "",
    eventCategory: "" as EventCategory | "",
    eventType: "" as EventType | "",
    eventSlug: "",
    eventSubtitle: "",
    eventStartDate: "",
    eventEndDate: "",
  });

  const [loading, setLoading] = useState(false);
  const { slugAvailable, checkingSlug } = useSlugAvailability(
    formData.eventSlug,
    eventService.checkSlugAvailability,
  );

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCategoryChange = (value: EventCategory) => {
    setFormData((prev) => ({ ...prev, eventCategory: value }));
  };

  const handleTypeChange = (value: EventType) => {
    setFormData((prev) => ({ ...prev, eventType: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const toastId = toast.loading("Creating event...");

    try {
      const payload = {
        eventTitle: formData.eventTitle,
        eventCategory: formData.eventCategory,
        eventType: formData.eventType,
        eventSlug: formData.eventSlug,
        eventSubtitle: formData.eventSubtitle,
        eventStartDate: formData.eventStartDate,
        eventEndDate: formData.eventEndDate,
      };

      await eventService.createEvent(payload);

      toast.success("Event created successfully!", { id: toastId });

      setFormData({
        eventTitle: "",
        eventCategory: "",
        eventType: "",
        eventSlug: "",
        eventSubtitle: "",
        eventStartDate: "",
        eventEndDate: "",
      });

      setShowCreateForm(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error creating event:", error);
      toast.error(error.response?.data?.message || "Failed to create event.", {
        id: toastId,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="animate-in fade-in slide-in-from-top-4 duration-300">
      <CardHeader>
        <CardTitle>Create New Event</CardTitle>
        <CardDescription>
          Fill in the basic details to initialize your event. You can add more
          details later.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="eventTitle">Event Title</Label>
              <Input
                id="eventTitle"
                name="eventTitle"
                placeholder="Enter event title"
                value={formData.eventTitle}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="eventSlug">URL Slug</Label>
              <div className="relative">
                <Input
                  id="eventSlug"
                  name="eventSlug"
                  placeholder="event-url-slug"
                  value={formData.eventSlug}
                  onChange={handleChange}
                  required
                  className={
                    slugAvailable === false
                      ? "border-red-500 focus-visible:ring-red-500 pr-10"
                      : slugAvailable === true
                        ? "border-green-500 focus-visible:ring-green-500 pr-10"
                        : "pr-10"
                  }
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  {checkingSlug ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : slugAvailable === true ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : slugAvailable === false ? (
                    <X className="w-4 h-4 text-red-500" />
                  ) : null}
                </div>
              </div>
              {slugAvailable === false && (
                <p className="text-sm text-red-500">
                  This slug is already taken.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Event Type */}
            <div className="space-y-2">
              <Label htmlFor="eventType">Event Type</Label>
              <Select
                value={formData.eventType}
                onValueChange={handleTypeChange}
                required
              >
                <SelectTrigger id="eventType" className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="eventCategory">Category</Label>
              <Select
                value={formData.eventCategory}
                onValueChange={handleCategoryChange}
                required
              >
                <SelectTrigger id="eventCategory" className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="eventSubtitle">Subtitle</Label>
            <Input
              id="eventSubtitle"
              name="eventSubtitle"
              placeholder="Enter event subtitle"
              value={formData.eventSubtitle}
              onChange={handleChange}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="eventStartDate">Start Date</Label>
              <Input
                id="eventStartDate"
                name="eventStartDate"
                type="date"
                value={formData.eventStartDate}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="eventEndDate">End Date</Label>
              <Input
                id="eventEndDate"
                name="eventEndDate"
                type="date"
                value={formData.eventEndDate}
                onChange={handleChange}
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading || slugAvailable === false || checkingSlug}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Event"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
