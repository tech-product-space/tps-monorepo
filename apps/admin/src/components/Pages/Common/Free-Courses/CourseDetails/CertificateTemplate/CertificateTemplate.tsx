import CertificateEmail from "./CertificateEmail/CertificateEmail";
import EditorContainer from "./EditorContainer";

const CertificateTemplate = ({ courseId }: { courseId: string }) => {

  return (
    <div className="flex flex-col gap-12 pb-10">
      <EditorContainer courseId={courseId} />
      <CertificateEmail courseId={courseId} /> 
    </div>
  );
};

export default CertificateTemplate;
