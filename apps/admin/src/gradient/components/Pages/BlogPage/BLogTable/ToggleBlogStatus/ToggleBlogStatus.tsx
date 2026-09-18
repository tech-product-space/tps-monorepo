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
import { blogService } from "@/gradient/services/blogService";

type Props = {
  blogId: string;
  status: "draft" | "published" | "scheduled";
  refetch?: () => void;
};

export const BlogStatusToggle = ({ blogId, status, refetch }: Props) => {
  const [currentStatus, setCurrentStatus] = useState(status);
  const isPublished = currentStatus === "published";

  const handleToggle = async () => {
    const newStatus = currentStatus === "published" ? "draft" : "published";

    // Optimistic update — UI changes immediately
    setCurrentStatus(newStatus);

    try {
      await blogService.toggleBlogStatus(blogId);
      refetch?.(); // sync parent state in background
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
          variant={isPublished ? "default" : "secondary"}
          className="cursor-pointer"
        >
          {isPublished ? "Published" : "Draft"}
        </Badge>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isPublished ? "Unpublish this blog?" : "Publish this blog?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isPublished
              ? "This blog will be moved back to draft and hidden from users."
              : "This blog will be visible to users once published."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleToggle}>
            Yes, {isPublished ? "Unpublish" : "Publish"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
