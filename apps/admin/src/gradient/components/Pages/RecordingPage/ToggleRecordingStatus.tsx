import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/gradient/components/ui/alert-dialog";
import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";
import { Globe, Loader2, Undo2 } from "lucide-react";
import { recordingService } from "@/gradient/services/recordingService";
import { RecordingResponse } from "@/gradient/types/recording";

type Props = {
  recording: Pick<RecordingResponse, "id" | "isPublished" | "video">;
  onChange?: (isPublished: boolean) => void;
  /**
   * How the trigger looks. `"badge"` is the list's status cell; `"button"` is
   * the header action on the editor and the manage screen.
   *
   * One component rather than two, because the part worth sharing is not the
   * trigger — it is the confirmation copy and the 400 handling. Publishing
   * without a video is a deliberate rejection whose message names what is
   * missing, and a second implementation would be one more place to forget
   * that and revert silently instead.
   */
  variant?: "badge" | "button";
};

export const ToggleRecordingStatus = ({
  recording,
  onChange,
  variant = "badge",
}: Props) => {
  const [isPublished, setIsPublished] = useState(recording.isPublished);
  const [busy, setBusy] = useState(false);

  const handleToggle = async () => {
    const next = !isPublished;

    setBusy(true);
    setIsPublished(next);

    try {
      await recordingService.toggleRecordingStatus(recording.id);
      onChange?.(next);
    } catch (error: any) {
      // Publishing without a video is a deliberate 400, not a fault — the
      // message names what is missing, so it has to reach the admin rather than
      // being swallowed into a silent revert.
      setIsPublished(!next);
      toast.error(
        error.response?.data?.message || "Could not change the status.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {variant === "button" ? (
          // Says what clicking it does, not what the state is — a header
          // button reading "Published" invites a click that unpublishes.
          <Button
            variant={isPublished ? "outline" : "default"}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : isPublished ? (
              <Undo2 className="mr-2 h-4 w-4" />
            ) : (
              <Globe className="mr-2 h-4 w-4" />
            )}
            {isPublished ? "Move to draft" : "Publish"}
          </Button>
        ) : (
          <Badge
            variant={isPublished ? "default" : "secondary"}
            className="cursor-pointer"
          >
            {busy ? "…" : isPublished ? "Published" : "Draft"}
          </Badge>
        )}
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isPublished
              ? "Move this recording to draft?"
              : "Publish this recording?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isPublished
              ? "It disappears from the recordings page. Anyone holding the video link can still watch on YouTube — the gate was never what kept it private."
              : "It appears on the recordings page. A YouTube link is required."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleToggle}>
            Yes, {isPublished ? "move to draft" : "publish"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
