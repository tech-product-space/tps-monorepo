"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTrigger,
} from "@/gradient/components/ui/alert-dialog";
import { Badge } from "@/gradient/components/ui/badge";
import { eventService } from "@/gradient/services/eventService";

type Props = {
  eventId: string;
  isPublished: boolean;
  refetch?: () => void;
};

export const ToggleEventPublish = ({ eventId, isPublished, refetch }: Props) => {
  const [published, setPublished] = useState(isPublished);

  const handleToggle = async () => {
    const newStatus = !published;

    // Optimistic update
    setPublished(newStatus);

    try {
      await eventService.toggleEventPublishStatus(eventId);
      refetch?.(); 
    } catch (error) {
      console.error("Toggle failed:", error);
      // Revert on failure
      setPublished(published);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Badge
          variant={published ? "default" : "secondary"}
          className="cursor-pointer"
        >
          {published ? "Published" : "Draft"}
        </Badge>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {published ? "Unpublish this event?" : "Publish this event?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {published
              ? "This event will be moved back to draft and hidden from users."
              : "This event will be visible to users once published."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleToggle}>
            Yes, {published ? "Unpublish" : "Publish"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
