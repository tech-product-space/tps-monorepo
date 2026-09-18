
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { X } from 'lucide-react';
import { useNotification } from '@/helpers/NotificationContext';
import EmailTextEditor3 from '@/components/Rich-Text-Editor/EmailTextEditor3';

// Slider Component
interface CertificateEmailSliderProps {
    isOpen: boolean;
    onClose: () => void;
    template: any;
    onSave: (data: any) => Promise<{ success: boolean }>;
}

function CertificateEmailSlider({ isOpen, onClose, template, onSave }: CertificateEmailSliderProps) {
    const { showNotification } = useNotification();
    const [subject, setSubject] = useState(template?.subject || "");
    const [emailBody, setEmailBody] = useState(template?.body || "");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (template) {
            setSubject(template.subject || "");
            setEmailBody(template.body || "");
        }
    }, [template]);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleEsc);
        return () => document.removeEventListener("keydown", handleEsc);
    }, [onClose]);

    const handleSave = async () => {
        if (!subject.trim() || !emailBody.trim()) {
            showNotification("error", "Subject and email body are required");
            return;
        }

        setSaving(true);
        
        const { success } = await onSave({
            subject,
            body: emailBody,
        });
        
        if (success) {
            showNotification("success", "Certificate email template saved")
        } else {
            showNotification("error", "Failed to save certificate email template")
        }
        
        setSaving(false);
    };

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40"
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        width: '100vw',
                        height: '100vh'
                    }}
                    onClick={onClose}
                />
            )}

            {/* Slider Panel */}
            <div
                className={`fixed top-0 right-0 h-screen bg-white border-l shadow-xl z-50 transform transition-transform duration-700 ease-in-out
        ${isOpen ? "translate-x-0" : "translate-x-full"}
        w-full sm:w-[80vw] lg:w-[700px]`}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-semibold text-gray-900">
                        Certificate Email Template
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 cursor-pointer"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 overflow-y-auto h-[calc(100vh-80px)] pb-20">
                    <div className="space-y-4">
                        <div>
                            <Label className="mb-2">Subject</Label>
                            <Input
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="Congratulations! Your certificate is ready"
                                className="mb-4"
                            />
                        </div>

                        <div>
                            <Label className="mb-2">Email Body</Label>
                            <EmailTextEditor3
                                value={emailBody}
                                onChange={setEmailBody}
                            />
                        </div>

                        <div className="flex justify-end gap-2 mt-4">
                            <Button variant="outline" onClick={onClose} disabled={saving}>
                                Cancel
                            </Button>
                            <Button disabled={saving} onClick={handleSave} className="bg-[#335DC8] hover:bg-[#2a4da3]">
                                {saving ? "Saving..." : "Save"}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default CertificateEmailSlider