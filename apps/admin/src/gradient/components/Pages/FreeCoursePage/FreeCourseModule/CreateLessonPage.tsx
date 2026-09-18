"use client";

import { useParams } from "next/navigation";
import LessonEditor from "./LessonEditor";

export default function CreateLessonPage() {
  const params = useParams();
  const moduleId = params.moduleId as string;
  
  return <LessonEditor isNew moduleId={moduleId} />;
}

