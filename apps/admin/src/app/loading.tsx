import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2
        className="animate-spin text-black"
        size={48}
        strokeWidth={1.5}
      />
    </div>
  );
}
  
