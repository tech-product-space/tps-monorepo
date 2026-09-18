"use client";

import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, ChevronRight, List, Type } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type ContentElementType = "paragraph" | "bullets" | "nested-bullets";

export interface ContentElement {
  id: string;
  type: ContentElementType;
  content: string;
  listItems?: string[];
  nestedItems?: { text: string; subItems: string[] }[];
}

export interface ContentSectionData {
  id: string;
  heading: string;
  subheading: string;
  elements: ContentElement[];
}

interface ContentSectionProps {
  data: ContentSectionData;
  onChange: (data: ContentSectionData) => void;
  onRemove?: () => void;
  isRemovable?: boolean;
}

export default function ContentSection({
  data,
  onChange,
  onRemove,
  isRemovable = true,
}: ContentSectionProps) {
  const updateSection = (updates: Partial<ContentSectionData>) => {
    onChange({ ...data, ...updates });
  };

  const addElement = (type: ContentElementType) => {
    const newElement: ContentElement = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      content: "",
      listItems: type === "bullets" ? [""] : undefined,
      nestedItems:
        type === "nested-bullets" ? [{ text: "", subItems: [""] }] : undefined,
    };
    updateSection({ elements: [...data.elements, newElement] });
  };

  const removeElement = (id: string) => {
    updateSection({ elements: data.elements.filter((el) => el.id !== id) });
  };

  const updateElement = (id: string, updates: Partial<ContentElement>) => {
    updateSection({
      elements: data.elements.map((el) =>
        el.id === id ? { ...el, ...updates } : el,
      ),
    });
  };

  const addListItem = (elementId: string) => {
    const el = data.elements.find((e) => e.id === elementId);
    if (el && el.listItems) {
      updateElement(elementId, { listItems: [...el.listItems, ""] });
    }
  };

  const updateListItem = (elementId: string, index: number, value: string) => {
    const el = data.elements.find((e) => e.id === elementId);
    if (el && el.listItems) {
      const newListRows = [...el.listItems];
      newListRows[index] = value;
      updateElement(elementId, { listItems: newListRows });
    }
  };

  const removeListItem = (elementId: string, index: number) => {
    const el = data.elements.find((e) => e.id === elementId);
    if (el && el.listItems) {
      updateElement(elementId, {
        listItems: el.listItems.filter((_, i) => i !== index),
      });
    }
  };

  const addNestedItem = (elementId: string) => {
    const el = data.elements.find((e) => e.id === elementId);
    if (el && el.nestedItems) {
      updateElement(elementId, {
        nestedItems: [...el.nestedItems, { text: "", subItems: [""] }],
      });
    }
  };

  const updateNestedItem = (
    elementId: string,
    index: number,
    value: string,
  ) => {
    const el = data.elements.find((e) => e.id === elementId);
    if (el && el.nestedItems) {
      const newNested = [...el.nestedItems];
      newNested[index].text = value;
      updateElement(elementId, { nestedItems: newNested });
    }
  };

  const addSubItem = (elementId: string, nestedIndex: number) => {
    const el = data.elements.find((e) => e.id === elementId);
    if (el && el.nestedItems) {
      const newNested = [...el.nestedItems];
      newNested[nestedIndex].subItems = [
        ...newNested[nestedIndex].subItems,
        "",
      ];
      updateElement(elementId, { nestedItems: newNested });
    }
  };

  const updateSubItem = (
    elementId: string,
    nestedIndex: number,
    subIndex: number,
    value: string,
  ) => {
    const el = data.elements.find((e) => e.id === elementId);
    if (el && el.nestedItems) {
      const newNested = [...el.nestedItems];
      newNested[nestedIndex].subItems[subIndex] = value;
      updateElement(elementId, { nestedItems: newNested });
    }
  };

  return (
    <Card className="border-gray-200 shadow-sm overflow-hidden mb-6">
      <CardHeader className="border-b border-gray-100  flex flex-row items-center justify-between">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[13px] font-semibold   tracking-wider">
              Section Heading
            </label>
            <Input
              placeholder="e.g. Introduction to Figma"
              value={data.heading}
              onChange={(e) => updateSection({ heading: e.target.value })}
              className="h-9 focus-visible:ring-blue-600 bg-white"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[13px] font-semibold   tracking-wider">
              Subheading (Optional)
            </label>
            <Input
              placeholder="e.g. Understanding the basics of interface design"
              value={data.subheading}
              onChange={(e) => updateSection({ subheading: e.target.value })}
              className="h-9 focus-visible:ring-blue-600 bg-white"
            />
          </div>
        </div>
        {isRemovable && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="ml-4 text-gray-400 hover:text-red-500 mt-5"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className=" space-y-8">
        {data.elements.length === 0 && (
          <div className="text-center py-12 border-2 border-dashed border-gray-100 rounded-xl">
            <p className="text-sm text-gray-400">
              No content added to this section yet.
            </p>
          </div>
        )}

        {data.elements.map((element, idx) => (
          <div
            key={element.id}
            className="relative group/element border border-transparent hover:border-blue-100 rounded-xl p-4 transition-all bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
          >
            <div className="flex items-center justify-between mb-4">
              <Badge
                variant="secondary"
                className="bg-blue-50 text-blue-700 hover:bg-blue-100 uppercase text-[10px] font-bold tracking-wider"
              >
                {element.type.replace("-", " ")}
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeElement(element.id)}
                className="h-7 w-7 text-gray-300 hover:text-red-500 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {element.type === "paragraph" && (
              <Textarea
                placeholder="Write your paragraph content here..."
                value={element.content}
                onChange={(e) =>
                  updateElement(element.id, { content: e.target.value })
                }
                className="min-h-[120px] focus-visible:ring-blue-600 resize-none border-gray-100"
              />
            )}

            {element.type === "bullets" && (
              <div className="space-y-2">
                {element.listItems?.map((item, lIdx) => (
                  <div key={lIdx} className="flex gap-2">
                    <div className="flex items-center justify-center w-8 h-9 text-gray-300">
                      •
                    </div>
                    <Input
                      value={item}
                      onChange={(e) =>
                        updateListItem(element.id, lIdx, e.target.value)
                      }
                      placeholder={`Point ${lIdx + 1}`}
                      className="h-9 focus-visible:ring-blue-600 border-gray-100"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeListItem(element.id, lIdx)}
                      className="h-9 w-9 text-gray-300 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addListItem(element.id)}
                  className="mt-2 text-xs border-dashed border-gray-200 text-gray-500 hover:border-blue-200 hover:text-blue-600"
                >
                  <Plus className="h-3 w-3 mr-2" /> Add Point
                </Button>
              </div>
            )}

            {element.type === "nested-bullets" && (
              <div className="space-y-4">
                {element.nestedItems?.map((item, nIdx) => (
                  <div
                    key={nIdx}
                    className="space-y-2 pl-4 border-l-2 border-blue-50"
                  >
                    <div className="flex gap-2">
                      <Input
                        value={item.text}
                        onChange={(e) =>
                          updateNestedItem(element.id, nIdx, e.target.value)
                        }
                        placeholder="Main point..."
                        className="h-9 focus-visible:ring-blue-600 font-medium"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const newNested = [...(element.nestedItems || [])];
                          updateElement(element.id, {
                            nestedItems: newNested.filter((_, i) => i !== nIdx),
                          });
                        }}
                        className="h-9 w-9 text-gray-300 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="space-y-2 pl-8">
                      {item.subItems.map((subItem, sIdx) => (
                        <div key={sIdx} className="flex gap-2">
                          <ChevronRight className="h-4 w-4 mt-2.5 text-gray-300" />
                          <Input
                            value={subItem}
                            onChange={(e) =>
                              updateSubItem(
                                element.id,
                                nIdx,
                                sIdx,
                                e.target.value,
                              )
                            }
                            placeholder={`Sub-point ${sIdx + 1}`}
                            className="h-8 text-sm focus-visible:ring-blue-600 bg-gray-50/50"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const newNested = [
                                ...(element.nestedItems || []),
                              ];
                              newNested[nIdx].subItems = newNested[
                                nIdx
                              ].subItems.filter((_, i) => i !== sIdx);
                              updateElement(element.id, {
                                nestedItems: newNested,
                              });
                            }}
                            className="h-8 w-8 text-gray-300 hover:text-red-500"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => addSubItem(element.id, nIdx)}
                        className="h-7 text-[10px] text-gray-400 hover:text-blue-600"
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add Sub-point
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addNestedItem(element.id)}
                  className="text-xs border-dashed border-gray-200 text-gray-500 hover:border-blue-200 hover:text-blue-600"
                >
                  <Plus className="h-3 w-3 mr-2" /> Add Main Point
                </Button>
              </div>
            )}
          </div>
        ))}

        <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-100">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => addElement("paragraph")}
            className="text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50"
          >
            <Type className="h-3.5 w-3.5 mr-2" />
            Add Paragraph
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => addElement("bullets")}
            className="text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50"
          >
            <List className="h-3.5 w-3.5 mr-2" />
            Add Bullets
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => addElement("nested-bullets")}
            className="text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50"
          >
            <List className="h-3.5 w-3.5 mr-2" />
            Add Nested Bullets
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
