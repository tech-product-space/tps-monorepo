import { getEventCertificateTemplate, ICertificateTemplate, saveCertificateTemplate } from "@/services/Events/certificateService";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import CertificateEditor from "@/components/Common/CertificateEditor/CertificateEditor";

interface EditorContainerProps {
    eventId: any;
}

const EditorContainer = ({ eventId }: EditorContainerProps) => {
    const [initialConfig, setInitialConfig] = useState<ICertificateTemplate | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    const fetchInitialConfig = async (eventId: string) => {
        setLoading(true);
        try {
            const config = await getEventCertificateTemplate(eventId);
            setInitialConfig(config);
        } catch (error) {
            console.error("Failed to fetch initial config:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (eventId) {
            fetchInitialConfig(eventId);
        }
    }, [eventId]);

    const handleSave = async (config: any): Promise<{ success: boolean; error?: string | undefined; }> => {
        try {
            await saveCertificateTemplate({ eventId, ...config });
            return { success: true };
        } catch (err: any) {
            console.error("Save failed:", err);
            return { success: false, error: "Failed to save certificate template." };
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>Loading Certificate Template...</span>
                </div>
            </div>
        );
    }

    return (
        <CertificateEditor onSave={handleSave} initialConfig={initialConfig} />
    )
};

export default EditorContainer;
