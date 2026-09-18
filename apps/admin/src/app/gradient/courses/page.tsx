import { Suspense } from "react";
import CoursePage from "@/gradient/components/Pages/CoursePage/CoursePage";

export default function Page() {
  return (
    <Suspense>
      <CoursePage />
    </Suspense>
  );
}
