import { useRef, useEffect } from "react";

export function useQuillUncontrolled(
  initialValue: string,
  onChange: (val: string) => void,
  transform?: (val: string) => string
) {
  const quillRef = useRef<any>(null);
  const isInternalChange = useRef(false);
  const lastValue = useRef(initialValue);

  // Only set contents when value changes externally (e.g. load from server)
  // NOT on every render
  useEffect(() => {
    const editor = quillRef.current?.getEditor?.();
    if (!editor) return;
    if (lastValue.current === initialValue) return;

    // External change — update the editor
    isInternalChange.current = false;
    lastValue.current = initialValue;
    editor.clipboard.dangerouslyPasteHTML(initialValue || "");
  }, [initialValue]);

  const handleChange = (value: string) => {
    const final = transform ? transform(value) : value;
    lastValue.current = final;
    onChange(final);
  };

  return { quillRef, handleChange };
}