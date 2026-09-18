"use client"
import AddEditProject from "@/components/Pages/Common/Portfolio/Projects/AddEditProject/AddEditProject"
import { notFound, useParams } from "next/navigation"

export default function EditProjectPage() {
  const { id } = useParams<{ id?: string }>();
  if (!id) {
    notFound()
  }

  return (
    <AddEditProject id={id} />
  )
}
