"use client";

import { useParams } from "next/navigation";
import LessonEditor from "./LessonEditor";

export default function EditLessonPage() {
  const params = useParams();
  const id = params.id as string;
  
  return <LessonEditor id={id} />;
}
