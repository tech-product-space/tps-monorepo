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
import { resourceService } from "@/gradient/services/resourceService";

type Props = {
  resourceId: string;
  isPublished: boolean;
  refetch?: () => void;
};

export const ToggleResourceStatus = ({ resourceId, isPublished, refetch }: Props) => {
  const [currentStatus, setCurrentStatus] = useState(isPublished);

  const handleToggle = async () => {
    const newStatus = !currentStatus;

    // Optimistic update
    setCurrentStatus(newStatus);

    try {
      await resourceService.toggleResourceStatus(resourceId);
      refetch?.();
    } catch (error) {
      console.error("Toggle failed:", error);
      // Revert on failure
      setCurrentStatus(currentStatus);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Badge
          variant={currentStatus ? "default" : "secondary"}
          className="cursor-pointer"
        >
          {currentStatus ? "Published" : "Draft"}
        </Badge>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {currentStatus ? "Unpublish this resource?" : "Publish this resource?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {currentStatus
              ? "This resource will be hidden from users."
              : "This resource will be visible to users once published."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleToggle}>
            Yes, {currentStatus ? "Unpublish" : "Publish"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
