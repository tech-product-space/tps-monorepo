"use client";

import React from "react";
import { Course } from "@/types/course";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import ContentSection, {
  ContentSectionData,
} from "@/components/Pages/Common/Free-Courses/common/ContentSection";

interface ContentSectionsProps {
  form: Partial<Course>;
  setForm: React.Dispatch<React.SetStateAction<Partial<Course>>>;
}

export const ContentSections: React.FC<ContentSectionsProps> = ({
  form,
  setForm,
}) => {
  return (
    <div className="space-y-6 mt-12 pb-12">
      <h3 className="text-lg font-semibold px-1">Course Content Sections</h3>
      {((form.content as any)?.sections || []).length === 0 ? (
        <div className="space-y-6">
          <ContentSection
            data={{
              id: "default-section",
              heading: "",
              subheading: "",
              elements: [],
            }}
            onChange={(newSection) => {
              setForm((prev) => ({
                ...prev,
                content: {
                  ...(prev.content as any),
                  sections: [newSection],
                },
              }));
            }}
            isRemovable={false}
          />
        </div>
      ) : (
        (form.content as any).sections.map(
          (section: ContentSectionData, sIdx: number) => (
            <ContentSection
              key={section.id}
              data={section}
              onChange={(updatedSection) => {
                const newSections = [...(form.content as any).sections];
                newSections[sIdx] = updatedSection;
                setForm((prev) => ({
                  ...prev,
                  content: {
                    ...(prev.content as any),
                    sections: newSections,
                  },
                }));
              }}
              onRemove={() => {
                const newSections = (form.content as any).sections.filter(
                  (_: any, i: number) => i !== sIdx,
                );
                setForm((prev) => ({
                  ...prev,
                  content: {
                    ...(prev.content as any),
                    sections: newSections,
                  },
                }));
              }}
            />
          ),
        )
      )}

      <Button
        onClick={() => {
          const currentSections = (form.content as any)?.sections || [];
          const newSection: ContentSectionData = {
            id: Math.random().toString(36).substr(2, 9),
            heading: "",
            subheading: "",
            elements: [],
          };
          setForm((prev) => ({
            ...prev,
            content: {
              ...(prev.content as any),
              sections: [...currentSections, newSection],
            },
          }));
        }}
        className="w-full h-12 border-gray-50 shadow-md border-2 bg-white gap-2"
        variant="outline"
      >
        <Plus size={18} />
        Add Another Content Section
      </Button>
    </div>
  );
};
