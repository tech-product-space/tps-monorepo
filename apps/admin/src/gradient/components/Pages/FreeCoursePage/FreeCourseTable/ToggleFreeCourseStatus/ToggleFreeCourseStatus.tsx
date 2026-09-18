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
import { freeCourseService } from "@/gradient/services/freeCourseService";

type Props = {
  courseId: string;
  isPublished: boolean;
  refetch?: () => void;
};

export const FreeCourseStatusToggle = ({
  courseId,
  isPublished,
  refetch,
}: Props) => {
  const [status, setStatus] = useState(isPublished);

  const handleToggle = async () => {
    const newStatus = !status;

    // optimistic update
    setStatus(newStatus);

    try {
      await freeCourseService.toggleStatus(courseId);
      refetch?.();
    } catch (error) {
      console.error("Toggle failed:", error);
      setStatus(status); // revert
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Badge
          variant={status ? "default" : "secondary"}
          className="cursor-pointer"
        >
          {status ? "Published" : "Draft"}
        </Badge>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {status ? "Unpublish this course?" : "Publish this course?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {status
              ? "This course will be hidden from users."
              : "This course will be visible to users."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleToggle}>
            Yes, {status ? "Unpublish" : "Publish"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};