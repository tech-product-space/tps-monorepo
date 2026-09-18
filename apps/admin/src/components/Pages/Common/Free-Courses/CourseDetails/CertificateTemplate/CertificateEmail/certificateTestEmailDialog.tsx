"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useNotification } from "@/helpers/NotificationContext";
import { sendCertificateTestEmail } from "@/services/courses/certificateService";
interface CertificateTestEmailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: any;
}

const CertificateTestEmailDialog = ({
  isOpen,
  onClose,
  courseId,
}: CertificateTestEmailDialogProps) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const { showNotification } = useNotification();

  const handleSend = async () => {
    if (!email) {
      showNotification("error", "Please enter an email address.");
      return;
    }

    setLoading(true);

    try {
      const data = await sendCertificateTestEmail({ courseId, email });

      if (data?.success) {
        showNotification(
          "success",
          data.message || "Test email sent successfully."
        );
        setEmail("");
        onClose();
      } else {
        showNotification("error", data?.error || "Unable to send test email.");
      }
    } catch (error: any) {
      console.error("Error sending test email:", error);

      // Extract a meaningful message if available
      const errorMessage =
        error?.response?.data?.error || "Unable to send test email.";
      showNotification("error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Test Email</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-gray-600 text-sm">
            Enter your email address below to receive a test email using this
            event’s certificate template.
          </p>

          <Input
            type="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Send Test Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CertificateTestEmailDialog;
