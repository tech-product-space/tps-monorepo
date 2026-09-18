"use client";

import React, { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
  Type,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  AiProductSection,
  RichTextSection,
  ToolsSection,
} from "@/types/aiProduct";
import RichTextEditor from "./RichTextEditor";
import ImageUploadField from "./ImageUploadField";

type Props = {
  sections: AiProductSection[];
  onChange: (sections: AiProductSection[]) => void;
};

function RichTextSectionFields({
  section,
  onUpdate,
}: {
  section: RichTextSection;
  onUpdate: (patch: Partial<RichTextSection>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Body</Label>
      <RichTextEditor
        value={section.body}
        onChange={(body) => onUpdate({ body })}
        placeholder="Section content…"
      />
    </div>
  );
}

function ToolsSectionFields({
  section,
  onUpdate,
}: {
  section: ToolsSection;
  onUpdate: (patch: Partial<ToolsSection>) => void;
}) {
  const updateTool = (index: number, patch: Partial<ToolsSection["tools"][number]>) => {
    const tools = section.tools.map((t, i) => (i === index ? { ...t, ...patch } : t));
    onUpdate({ tools });
  };

  return (
    <div className="space-y-3">
      <Label>Tools</Label>
      {section.tools.map((tool, i) => (
        <div key={i} className="flex items-start gap-2 border rounded-md p-3 bg-gray-50">
          <div className="flex-1 grid grid-cols-2 gap-2">
            <Input
              value={tool.name}
              onChange={(e) => updateTool(i, { name: e.target.value })}
              placeholder="Tool name (e.g. Claude)"
            />
            <ImageUploadField
              value={tool.logoUrl}
              onChange={(logoUrl) => updateTool(i, { logoUrl })}
              placeholder="Logo URL or upload"
              hint="64×64px (square, transparent PNG)"
              previewClassName="h-8 w-8 rounded object-contain border bg-white"
            />
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onUpdate({ tools: section.tools.filter((_, j) => j !== i) })}
          >
            <Trash2 size={15} className="text-red-500" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => onUpdate({ tools: [...section.tools, { name: "", logoUrl: "" }] })}
      >
        <Plus size={14} />
        Add tool
      </Button>

      <div className="space-y-1.5 pt-2">
        <Label>
          Body <span className="text-gray-400 font-normal">(optional — shown below the chips)</span>
        </Label>
        <RichTextEditor
          value={section.body || ""}
          onChange={(body) => onUpdate({ body })}
          placeholder="e.g. why these tools were chosen…"
        />
      </div>
    </div>
  );
}

function SortableSectionCard({
  section,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
}: {
  section: AiProductSection;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<AiProductSection>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-white border rounded-lg shadow-sm">
      <div className="flex items-center gap-2 p-3">
        <button type="button" onClick={onToggle}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <button type="button" {...attributes} {...listeners} className="cursor-grab text-gray-400">
          <GripVertical size={16} />
        </button>
        <span className="font-medium flex-1 truncate">
          {section.title || <span className="text-gray-400">Untitled section</span>}
        </span>
        <Badge variant="outline" className="text-[10px] uppercase gap-1">
          {section.type === "tools" ? <Wrench size={10} /> : <Type size={10} />}
          {section.type === "tools" ? "Tools" : "Rich text"}
        </Badge>
        <Button type="button" size="icon" variant="ghost" onClick={onDelete}>
          <Trash2 size={15} className="text-red-500" />
        </Button>
      </div>

      {expanded && (
        <div className="border-t p-4 space-y-3">
          <div className="space-y-1.5">
            <Label>Section title</Label>
            <Input
              value={section.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              placeholder='e.g. "Problem Statement"'
            />
          </div>
          {section.type === "richText" ? (
            <RichTextSectionFields section={section} onUpdate={onUpdate} />
          ) : (
            <ToolsSectionFields section={section} onUpdate={onUpdate} />
          )}
        </div>
      )}
    </div>
  );
}

export default function SectionBuilder({ sections, onChange }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addSection = (type: "richText" | "tools") => {
    const id = crypto.randomUUID();
    const section: AiProductSection =
      type === "richText"
        ? { id, type: "richText", title: "", body: "" }
        : { id, type: "tools", title: "Tools Used", tools: [] };
    onChange([...sections, section]);
    setExpandedIds((prev) => new Set(prev).add(id));
  };

  const updateSection = (id: string, patch: Partial<AiProductSection>) => {
    onChange(
      sections.map((s) => (s.id === id ? ({ ...s, ...patch } as AiProductSection) : s))
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    onChange(arrayMove(sections, oldIndex, newIndex));
  };

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {sections.map((section) => (
            <SortableSectionCard
              key={section.id}
              section={section}
              expanded={expandedIds.has(section.id)}
              onToggle={() => toggle(section.id)}
              onUpdate={(patch) => updateSection(section.id, patch)}
              onDelete={() => onChange(sections.filter((s) => s.id !== section.id))}
            />
          ))}
        </SortableContext>
      </DndContext>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="gap-1.5">
            <Plus size={16} />
            Add section
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => addSection("richText")} className="gap-2">
            <Type size={14} />
            Rich text (Problem, Solution, Learnings…)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => addSection("tools")} className="gap-2">
            <Wrench size={14} />
            Tools used
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
