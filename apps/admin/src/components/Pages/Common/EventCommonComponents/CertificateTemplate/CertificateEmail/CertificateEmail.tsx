import { Button } from "@/components/ui/button";
import { Plus, Mail, Edit, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import CertificateEmailSlider from "../../../../../Common/CertificateEditor/CertificateEmailSlider";
import { Label } from "@radix-ui/react-label";
import {
  getEmailTemplateByEvent,
  saveCertificateEmailTemplate,
} from "@/services/Events/certificateService";
import CertificateTestEmailDialog from "./certificateTestEmailDialog";

interface CertificateEmailProps {
  eventId: any;
}

const CertificateEmail = ({ eventId }: CertificateEmailProps) => {
  const [template, setTemplate] = useState<{
    subject: string;
    body: any;
  } | null>(null);
  const [isSliderOpen, setIsSliderOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    const fetchTemplate = async () => {
      if (!eventId) return;

      setIsLoading(true);
      try {
        const { emailBody, emailSubject } = await getEmailTemplateByEvent({
          eventId,
        });
        if (!emailBody && !emailSubject) {
          setTemplate(null);
        } else {
          setTemplate((_) => ({
            subject: emailSubject || "",
            body: emailBody || "",
          }));
        }
      } catch (error) {
        console.error("Failed to fetch template:", error);
        setTemplate(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemplate();
  }, [eventId]);

  const handleSaveTemplate = async (data: any) => {
    try {
      await saveCertificateEmailTemplate({
        eventId,
        emailSubject: data.subject,
        emailBody: data.body,
      });
      setTemplate(data);
      return { success: true };
    } catch (error) {
      console.log("Failed To Save Event Email Certificate Template", error);
      return { success: false };
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 bg-white rounded-2xl border font-sans">
        <div className="flex justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-2">
              Certificate Email Template
            </h1>
            <p className="text-lg font-medium mb-2 text-gray-600">
              Customize the email sent to users when certificates are generated
            </p>
          </div>
        </div>

        <div className="text-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-sm">Loading template...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-6 bg-white rounded-2xl border font-sans">
        <div className="flex justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-2">
              Certificate Email Template
            </h1>
            <p className="text-lg font-medium mb-2 text-gray-600">
              Customize the email sent to users when certificates are generated
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick= {() => setIsDialogOpen(true)}>Send Test Email</Button>
            <div>
              <Button variant="ghost" onClick={() => setIsSliderOpen(true)}>
                {template ? <Edit size={18} /> : <Plus size={22} />}
              </Button>
            </div>
          </div>
        </div>

        {!template ? (
          <div className="text-center py-12">
            <div className="bg-gray-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
              <Mail className="text-gray-400" size={40} />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              No template configured
            </h3>
            <p className="text-gray-600 text-sm mb-8 max-w-md mx-auto">
              Create an email template to automatically send to users when their
              certificates are generated
            </p>
          </div>
        ) : (
          <div className="border rounded-lg p-6">
            <div className="mb-4">
              <Label className="text-sm font-medium text-gray-500">
                Subject
              </Label>
              <p className="text-base font-medium mt-1">{template.subject}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-500">
                Email Body
              </Label>
              <div
                className="mt-2 p-4 bg-gray-50 rounded-lg border prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: template.body }}
              />
            </div>
          </div>
        )}
      </div>

      <CertificateEmailSlider
        isOpen={isSliderOpen}
        onClose={() => setIsSliderOpen(false)}
        template={template}
        onSave={handleSaveTemplate}
      />

      <CertificateTestEmailDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        eventId={eventId}
      />
    </>
  );
};

export default CertificateEmail;
