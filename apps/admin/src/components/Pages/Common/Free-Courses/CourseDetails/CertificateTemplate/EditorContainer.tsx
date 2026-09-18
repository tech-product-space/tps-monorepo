import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import CertificateEditor from "@/components/Common/CertificateEditor/CertificateEditor";
import {
  getCourseCertificateTemplate,
  saveCertificateTemplate,
  ICertificateTemplate,
} from "@/services/courses/certificateService";

interface EditorContainerProps {
  courseId: any;
}

const EditorContainer = ({ courseId }: EditorContainerProps) => {
  const [initialConfig, setInitialConfig] =
    useState<ICertificateTemplate | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchInitialConfig = async (courseId: string) => {
    setLoading(true);
    try {
      console.log("Course Id :  "  , courseId)
      const config = await getCourseCertificateTemplate(courseId);
      setInitialConfig(config);
    } catch (error) {
      console.error("Failed to fetch initial config:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (courseId) {
      fetchInitialConfig(courseId);
    }
  }, [courseId]);

  const handleSave = async (
    config: any,
  ): Promise<{ success: boolean; error?: string | undefined }> => {
    try {
      await saveCertificateTemplate(courseId, config);
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
  );
};

export default EditorContainer;
