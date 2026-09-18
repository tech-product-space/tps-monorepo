import { useState } from "react";
import { Mail, Loader2, Copy, Check } from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/gradient/components/ui/drawer";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Button } from "@/gradient/components/ui/button";
import EmailEditor from "@/gradient/components/ui/EmailEditor/EmailEditor";
import { resourceService } from "@/gradient/services/resourceService";
import { toast } from "sonner";
import { EmailTemplate } from "@/gradient/types/resource";

export default function MailingSection({
  resourceId,
  resourceSlug,
  pdfKey,
  mailTemplate,
}: {
  resourceId: string;
  resourceSlug: string;
  pdfKey?: string;
  mailTemplate?: EmailTemplate;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleOpenDrawer = () => {
    setSubject(mailTemplate?.subject || "");
    setBody(mailTemplate?.body || "");
    setIsOpen(true);
  };

  const handleCopyPdfLink = async () => {
    if (!pdfKey) {
      toast.error("No PDF link available.");
      return;
    }
    const fullUrl = `https://thegradient.co.in/resources/${resourceSlug}/${pdfKey}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast.success("PDF page link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link.");
    }
  };

  const handleSave = async () => {
    if (!subject || !body) {
      toast.error("Subject and body are required.");
      return;
    }

    try {
      setIsLoading(true);
      await resourceService.updateEmailTemplate(resourceId, {
        subject,
        body,
      });
      toast.success("Email template updated successfully.");
      setIsOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to update email template.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
        Resource Emails
      </h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        Manage the email sent to users when they are granted access to this
        resource.
      </p>

      <div
        onClick={handleOpenDrawer}
        className="group relative flex items-center gap-4 rounded-lg border-2 border-zinc-100 dark:border-zinc-800 p-4 cursor-pointer hover:shadow-md transition-all bg-zinc-50/50 dark:bg-zinc-900/50"
      >
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Mail size={20} />
        </div>
        <div className="flex-grow">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Access Confirmation Email
          </h3>
          <p className="text-xs text-zinc-500 line-clamp-1">
            {mailTemplate?.subject || "No template configured yet"}
          </p>
        </div>
        <div className="flex flex-col gap-1.5 opacity-40">
          <div className="h-1.5 w-12 bg-zinc-300 dark:bg-zinc-700 rounded-full" />
          <div className="h-1.5 w-8 bg-zinc-300 dark:bg-zinc-700 rounded-full" />
        </div>
      </div>

      <Drawer open={isOpen} onOpenChange={setIsOpen} direction="right">
        <DrawerContent className="w-full sm:min-w-[50vw] h-full ml-auto rounded-none border-l">
          <DrawerHeader className="border-b text-left flex flex-row justify-between">
            <div>
              <DrawerTitle>Edit Access Email</DrawerTitle>
              <DrawerDescription>
                Customize the email template for this resource.
              </DrawerDescription>
            </div>

            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyPdfLink}
                disabled={!pdfKey}
                className="flex items-center gap-1.5"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? "Copied!" : "Copy PDF Page Link"}
              </Button>
            </div>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 w-full max-w-full">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter email subject"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>Email Body</Label>
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden bg-white dark:bg-zinc-950 min-h-[400px]">
                  <EmailEditor value={body} onChange={setBody} />
                </div>
              </div>
            </div>
          </div>

          <DrawerFooter className="border-t bg-zinc-50 dark:bg-zinc-900/50 flex-col sm:flex-row gap-2 justify-end p-4">
            <DrawerClose asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                Cancel
              </Button>
            </DrawerClose>
            <Button
              onClick={handleSave}
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Template
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
