import { useState } from "react";
import { Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
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
import EmailTemplateToolbar from "@/gradient/components/Common/EmailTemplateToolbar/EmailTemplateToolbar";
import { eventService } from "@/gradient/services/eventService";
import { toast } from "sonner";
const EMAIL_TYPES = [
  {
    icon: Clock,
    color: "text-orange-500",
    bg: "bg-orange-100",
    border: "border-orange-200",
    label: "Waitlisted",
    bars: ["75%", "50%"],
  },
  {
    icon: CheckCircle2,
    color: "text-emerald-500",
    bg: "bg-emerald-100",
    border: "border-emerald-200",
    label: "Approved",
    bars: ["85%", "55%"],
  },
  {
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-100",
    border: "border-red-200",
    label: "Declined",
    bars: ["80%", "45%"],
  },
];

const HACKATHON_EMAIL_TYPES = [
  {
    icon: CheckCircle2,
    color: "text-emerald-500",
    bg: "bg-emerald-100",
    border: "border-emerald-200",
    label: "Registered",
    bars: ["85%", "55%"],
  },
];

export default function MailingSection({
  eventId,
  eventTitle,
  eventType,
}: {
  eventId: string;
  eventTitle: string;
  eventType?: string;
}) {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingTemplate, setIsFetchingTemplate] = useState(false);

  const handleOpenDrawer = async (type: string) => {
    setSelectedType(type); // 'Waitlisted', 'Approved', 'Declined'
    setSubject("");
    setBody("");
    setIsFetchingTemplate(true);

    try {
      const response = await eventService.getTemplate(eventId, type);
      if (response && response.data) {
        setSubject(response.data.subject || "");
        setBody(response.data.body || "");
      }
    } catch (error: any) {
      // 404 means no template yet, which is fine.
      if (error?.response?.status !== 404) {
        toast.error("Failed to load existing template.");
      }
    } finally {
      setIsFetchingTemplate(false);
    }
  };

  const handleSave = async () => {
    if (!selectedType || !subject || !body) {
      toast.error("Subject, body, and type are required.");
      return;
    }

    try {
      setIsLoading(true);
      await eventService.upsertTemplate(eventId, {
        type: selectedType,
        subject,
        body,
      });
      toast.success("Template saved successfully.");
      setSelectedType(null); // close drawer
    } catch (error) {
      console.error(error);
      toast.error("Failed to save template.");
    } finally {
      setIsLoading(false);
    }
  };

  const isHackathonEvent =
    eventType === "Teardown" || eventType === "Hackathon";

  const emailTypesToRender = isHackathonEvent
    ? HACKATHON_EMAIL_TYPES
    : EMAIL_TYPES;

  return (
    <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
        Registration Emails
      </h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        Customize emails sent at each stage of the registration flow.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {emailTypesToRender.map(
          ({ icon: Icon, color, bg, border, label, bars }) => (
            <div
              key={label}
              onClick={() => handleOpenDrawer(label)}
              className={`rounded-lg border-2 ${border} ${bg} p-4 cursor-pointer hover:opacity-80 transition-opacity`}
            >
              <div className="flex items-center gap-2 mb-4">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-sm font-semibold text-zinc-800">
                  {label}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {bars.map((w, i) => (
                  <div
                    key={i}
                    className="h-2.5 bg-white/50 rounded-full"
                    style={{ width: w }}
                  />
                ))}
              </div>
            </div>
          ),
        )}
      </div>

      <Drawer
        open={!!selectedType}
        onOpenChange={(open) => !open && setSelectedType(null)}
        direction="right"
      >
        <DrawerContent className="w-full sm:min-w-[50vw] h-full ml-auto rounded-none border-l">
          <DrawerHeader className="border-b text-left">
            <div className="mx-auto mt-4 hidden h-1.5 w-[100px] shrink-0 rounded-full bg-zinc-200 group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
            <DrawerTitle>Edit {selectedType} Email</DrawerTitle>
            <DrawerDescription>
              Customize the email sent to users when their registration is{" "}
              {selectedType ? selectedType.toLowerCase() : ""}.
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 w-full max-w-full">
            {isFetchingTemplate ? (
              <div className="flex flex-col items-center justify-center h-[400px] text-zinc-500 gap-3">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p>Loading template...</p>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {/* The drawer stays mounted through its close animation, so
                    guard rather than cast — selectedType is briefly null. */}
                {selectedType && (
                  <EmailTemplateToolbar
                    eventId={eventId}
                    type={selectedType}
                    eventTitle={eventTitle}
                    subject={subject}
                    body={body}
                    onPaste={({ subject: nextSubject, body: nextBody }) => {
                      setSubject(nextSubject);
                      setBody(nextBody);
                    }}
                  />
                )}

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
                  <div className="border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden bg-white dark:bg-zinc-950">
                    <EmailEditor value={body} onChange={setBody} />
                  </div>
                </div>
              </div>
            )}
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
