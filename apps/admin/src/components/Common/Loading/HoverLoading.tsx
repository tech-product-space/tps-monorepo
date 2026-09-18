"use client";

interface HoverLoadingProps {
  title: string;
}

export function HoverLoading({ title }: HoverLoadingProps) {
  return (
    <div className="fixed inset-0 bg-[#0000006e] bg-opacity-70 flex items-center justify-center z-50 flex-col gap-2">
      <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
      <p className="text-lg font-bold text-white">{title}</p>
    </div>
  );
}


export default function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-5">
      <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}