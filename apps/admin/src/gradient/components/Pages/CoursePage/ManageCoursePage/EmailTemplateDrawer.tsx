"use client";

import { useState } from "react";
import { Copy, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
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
import { Switch } from "@/gradient/components/ui/switch";
import EmailEditor from "@/gradient/components/ui/EmailEditor/EmailEditor";
import { courseService } from "@/gradient/services/courseService";
import { CourseEmailTemplate } from "@/gradient/types/course";
import { COURSE_EMAIL_META } from "../constants";

export default function EmailTemplateDrawer({
  courseId,
  template,
  variables,
  brochureLink,
  open,
  onOpenChange,
  onSaved,
}: {
  courseId: string;
  template: CourseEmailTemplate;
  variables: string[];
  brochureLink: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const meta = COURSE_EMAIL_META[template.type];

  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [isEnabled, setIsEnabled] = useState(template.isEnabled);
  const [testEmail, setTestEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  const handleSave = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and body are both required.");
      return;
    }

    setSaving(true);

    try {
      await courseService.saveEmailTemplate(courseId, template.type, {
        subject: subject.trim(),
        body,
        isEnabled,
      });
      toast.success("Template saved.");
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to save template.");
    } finally {
      setSaving(false);
    }
  };

  // Sends whatever is stored, not what is on screen — so the test always
  // reflects the version applicants would actually receive.
  const handleTestSend = async () => {
    if (!testEmail.trim()) {
      toast.error("Enter an address to send the test to.");
      return;
    }

    setTesting(true);

    try {
      const response = await courseService.sendTestEmail(
        courseId,
        template.type,
        testEmail.trim(),
      );
      toast.success(response.message || "Test sent.");
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          "Could not send the test. Save the template first.",
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="ml-auto h-full w-full rounded-none border-l sm:min-w-[55vw]">
        <DrawerHeader className="flex flex-row items-start justify-between border-b text-left">
          <div>
            <DrawerTitle>{meta.label}</DrawerTitle>
            <DrawerDescription>{meta.description}</DrawerDescription>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {isEnabled ? "Sending" : "Paused"}
            </span>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>
        </DrawerHeader>

        <div className="w-full max-w-full flex-1 overflow-y-auto p-4 md:p-6">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="We received your application"
              />
            </div>

            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-xs font-medium">
                Click a variable to copy it, then paste it into the subject or
                body.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {variables.map((variable) => (
                  <button
                    key={variable}
                    type="button"
                    onClick={() => copy(`{{${variable}}}`, variable)}
                    className="rounded-full border bg-background px-3 py-1 font-mono text-xs hover:border-primary hover:text-primary"
                  >
                    {`{{${variable}}}`}
                  </button>
                ))}
              </div>

              {template.type === "BROCHURE_DOWNLOAD" && brochureLink && (
                <div className="mt-4 flex items-center gap-2 border-t pt-3">
                  <code className="flex-1 truncate rounded bg-background px-2 py-1.5 text-xs">
                    {brochureLink}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copy(brochureLink, "Brochure link")}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy brochure link
                  </Button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Email Body</Label>
              <div className="min-h-[400px] overflow-hidden rounded-md border bg-white dark:bg-zinc-950">
                <EmailEditor value={body} onChange={setBody} />
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border p-4">
              <Label htmlFor="test-email">Send a test</Label>
              <div className="flex gap-2">
                <Input
                  id="test-email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@gradientlearnings.org"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestSend}
                  disabled={testing}
                >
                  {testing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Sends the saved version with sample data, so save your edits
                first.
              </p>
            </div>
          </div>
        </div>

        <DrawerFooter className="flex-col justify-end gap-2 border-t bg-muted/40 p-4 sm:flex-row">
          <DrawerClose asChild>
            <Button variant="outline" className="w-full sm:w-auto">
              Cancel
            </Button>
          </DrawerClose>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Template
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
