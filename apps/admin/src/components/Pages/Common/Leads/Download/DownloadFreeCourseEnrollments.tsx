"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import { getCourseEnrollments } from "@/services/courses/enrollment";

interface DownloadFreeCourseEnrollmentsProps {
  courseId: string;
  filename?: string;
  className?: string;
  variant?:
    | "default"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "destructive";
}

export function DownloadFreeCourseEnrollments({
  courseId,
  filename = "enrollments",
  className,
  variant = "outline",
}: DownloadFreeCourseEnrollmentsProps) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      let page = 1;
      let allData: any[] = [];
      let hasNextPage = true;
      const limit = 50;

      while (hasNextPage) {
        const response = await getCourseEnrollments(courseId, page, limit);
        if (response?.data) {
          allData = [...allData, ...response.data];
        }
        hasNextPage = response?.meta?.hasNextPage ?? false;
        page++;
      }

      if (allData.length === 0) return;

      const flattenObject = (obj: any, parentKey = "", result: any = {}) => {
        for (const key in obj) {
          const newKey = parentKey ? `${parentKey}_${key}` : key;
          if (
            typeof obj[key] === "object" &&
            obj[key] !== null &&
            !Array.isArray(obj[key])
          ) {
            flattenObject(obj[key], newKey, result);
          } else {
            result[newKey] = obj[key];
          }
        }
        return result;
      };

      // Map to human-readable columns
      const formattedData = allData.map((item) => {
        const flat = flattenObject(item);
        return {
          "Enrollment ID": flat.id,
          Name: flat.name,
          Phone: flat.phone,
          Email: flat.form_data_email,
          LinkedIn: flat.form_data_linkedin,
          Profession: flat.form_data_profession,
          "Professional Role": flat.form_data_professionalRole,
          "College Name": flat.form_data_collegeName,
          "Year of Graduation": flat.form_data_yearOfGraduation,
          Country: flat.form_data_country_name,
          "Country Code": flat.form_data_country_code,
          "User ID": flat.user_id,
          "Progress (%)": flat.progress,
          "Total Lessons": flat.totalLessons,
          "Completed Lessons": flat.completedLessonsCount,
          Completed: flat.completed ? "Yes" : "No",
          "Certificate ID": flat.certificate_certificateId ?? "N/A",
          "Certificate Generated At":
            flat.certificate_certificateGeneratedAt
              ? new Date(flat.certificate_certificateGeneratedAt).toLocaleString()
              : "N/A",
          "Enrolled At": flat.createdAt
            ? new Date(flat.createdAt).toLocaleString()
            : "",
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(formattedData);

      // Auto-size columns
      const colWidths = Object.keys(formattedData[0] || {}).map((key) => ({
        wch: Math.max(
          key.length,
          ...formattedData.map((row) => String(row[key as keyof typeof row] ?? "").length)
        ),
      }));
      worksheet["!cols"] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Enrollments");
      XLSX.writeFile(workbook, `${filename}.xlsx`);
    } catch (error) {
      console.error("Error downloading enrollments:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleDownload}
      disabled={loading}
      variant={variant}
      className={className}
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Preparing...
        </>
      ) : (
        <>
          <Download className="mr-2 h-4 w-4" />
          Export Excel
        </>
      )}
    </Button>
  );
}