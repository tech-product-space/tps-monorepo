"use client";

import React from "react";
import { Course } from "@/types/course";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

interface SummarySectionProps {
  form: Partial<Course>;
  setForm: React.Dispatch<React.SetStateAction<Partial<Course>>>;
}

export const SummarySection: React.FC<SummarySectionProps> = ({
  form,
  setForm,
}) => {
  return (
    <Card className="border-gray-200 mt-6">
      <CardHeader className="border-b border-gray-100 flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold">Summary Section</CardTitle>
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => {
            const current = (form.content as any)?.summarySection || {
              heading: "",
              items: [],
            };
            setForm((prev) => ({
              ...prev,
              content: {
                ...(prev.content || {}),
                summarySection: {
                  ...current,
                  items: [...(current.items || []), { key: "", value: "" }],
                },
              },
            }));
          }}
        >
          <Plus className="h-4 w-4" />
          Add Item
        </Button>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-1.5">
          <Label className="text-[13px] font-semibold tracking-wider">
            Section Heading
          </Label>
          <Input
            value={(form.content as any)?.summarySection?.heading || ""}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                content: {
                  ...(prev.content || {}),
                  summarySection: {
                    ...((prev.content as any)?.summarySection || {
                      items: [],
                    }),
                    heading: e.target.value,
                  },
                },
              }))
            }
            placeholder="e.g. Program Highlights"
            className="focus-visible:ring-blue-600 shadow-sm border-gray-200"
          />
        </div>

        <div className="space-y-4">
          {((form.content as any)?.summarySection?.items || []).map(
            (item: any, idx: number) => (
              <div key={idx} className="flex gap-4 items-end">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-[12px] font-medium text-gray-500">
                    Key
                  </Label>
                  <Input
                    value={item.key}
                    onChange={(e) => {
                      const newItems = [
                        ...(form.content as any).summarySection.items,
                      ];
                      newItems[idx].key = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        content: {
                          ...(prev.content || {}),
                          summarySection: {
                            ...(prev.content as any).summarySection,
                            items: newItems,
                          },
                        },
                      }));
                    }}
                    placeholder="e.g. Duration"
                    className="focus-visible:ring-blue-600"
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label className="text-[12px] font-medium text-gray-500">
                    Value
                  </Label>
                  <Input
                    value={item.value}
                    onChange={(e) => {
                      const newItems = [
                        ...(form.content as any).summarySection.items,
                      ];
                      newItems[idx].value = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        content: {
                          ...(prev.content || {}),
                          summarySection: {
                            ...(prev.content as any).summarySection,
                            items: newItems,
                          },
                        },
                      }));
                    }}
                    placeholder="e.g. 12 Weeks"
                    className="focus-visible:ring-blue-600"
                  />
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-gray-400 hover:text-red-500"
                  onClick={() => {
                    const newItems = (
                      form.content as any
                    ).summarySection.items.filter(
                      (_: any, i: number) => i !== idx,
                    );
                    setForm((prev) => ({
                      ...prev,
                      content: {
                        ...(prev.content || {}),
                        summarySection: {
                          ...(prev.content as any).summarySection,
                          items: newItems,
                        },
                      },
                    }));
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ),
          )}
          {((form.content as any)?.summarySection?.items || []).length ===
            0 && (
            <p className="text-sm text-gray-400 italic text-center py-4 bg-gray-50 rounded-lg border border-dashed">
              No items added yet. Click "Add Item" to start.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
