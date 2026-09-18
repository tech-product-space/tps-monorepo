"use client";

import Projects from '@/components/Pages/Common/Projects/InternalProject/InternalProject'
import { notFound, useParams } from "next/navigation";

export default function EditProjectPage() {
  const { id } = useParams<{ id?: string }>();
  if (!id) {
    notFound();
  }

  return <Projects id={id} />;
}
