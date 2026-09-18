"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import "@/styles/quill-editor.css";
import "react-quill-new/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });

const toolbarOptions = [
  [{ font: [] }],
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ color: [] }, { background: [] }],
  [{ script: "sub" }, { script: "super" }],
  [{ list: "ordered" }, { list: "bullet" }],
  [{ indent: "-1" }, { indent: "+1" }],
  [{ align: [] }],
  ["blockquote", "code-block"],
  ["link"],
  ["clean"],
  ["table"]
];

interface BlogEditorProps {
  content: string;
  onChange: (content: string) => void;
  id: number;
}

export default function BlogEditor({ content, onChange, id }: BlogEditorProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-64 border rounded-md bg-gray-50"></div>;
  }

  return (
    <div className="quill-editor" >
      <ReactQuill
        value={content}
        onChange={onChange}
        modules={{
          toolbar: toolbarOptions,
        }}
        theme="snow"
        className="custom-quill "
        key={id}
      />
    </div>
  );
}
