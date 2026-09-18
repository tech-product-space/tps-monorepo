"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { UploadCsvDialog } from "./UploadCsvDialog";

interface UploadCsvButtonProps {
  onSuccess?: () => void;
  disabled?: boolean;
}

export const UploadCsvButton = ({
  onSuccess,
  disabled = false,
}: UploadCsvButtonProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Upload className="h-4 w-4 mr-2" />
        Upload CSV
      </Button>

      <UploadCsvDialog
        open={open}
        onClose={() => setOpen(false)}
        onSuccess={onSuccess}
      />
    </>
  );
};
