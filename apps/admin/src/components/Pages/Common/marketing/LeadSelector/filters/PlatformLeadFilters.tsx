"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type Props = {
    value: any;
    onChange: (filters: any) => void;
};

const PROGRAMS = [
    {
        id: "ai-for-pm",
        label: "Advanced AI Program",
        types: [
            { id: "ai-for-pm-enrollments", label: "Enrollments Only" },
            { id: "ai-for-pm-download-curriculum", label: "Download Curriculum" },
            { id: "ai-for-pm-scholarship", label: "Scholarship Applications" },
        ],
    },
    {
        id: "pm-fellowship",
        label: "PM Fellowship",
        types: [
            { id: "pm-fellowship-enrollments", label: "Enrollments Only" },
            { id: "pm-fellowship-download-curriculum", label: "Download Curriculum" },
        ],
    },
    {
        id: "interview-course",
        label: "Interview Course",
        types: [
            { id: "interview-course-enrollments", label: "Enrollments Only" },
            {
                id: "interview-course-download-curriculum",
                label: "Download Curriculum",
            },
        ],
    },
    {
        id: "free-course",
        label: "Free Course",
        types: [{ id: "free-course-enrollments", label: "Enrollments Only" }],
    },
    {
        id: "gen-ai",
        label: "GenAI",
        types: [
            { id: "gen-ai-enrollments", label: "Enrollments Only" },
            { id: "gen-ai-download-curriculum", label: "Download Curriculum" },
            { id: "gen-ai-contact-us", label: "Contact Us" },
        ],
    },
    {
        id: "ai-for-product-leaders",
        label: "AI for Product Leaders",
        types: [
            { id: "ai-for-product-leaders-enrollments", label: "Enrollments Only" },
            {
                id: "ai-for-product-leaders-download-curriculum",
                label: "Download Curriculum",
            },
            { id: "ai-for-product-leaders-contact-us", label: "Contact Us" },
        ],
    },
    {
        id: "contact-us",
        label: "Contact Us",
        types: [{ id: "contact-us", label: "Contact Us" }],
    },
    {
        id: "request-callback",
        label: "Request Callback",
        types: [{ id: "request-callback", label: "Request Callback" }],
    },
];

export default function PlatformLeadFilters({ value, onChange }: Props) {
    const selectedPrograms = value?.programs ?? [];

    const isProgramSelected = (id: string) =>
        selectedPrograms.some((p: any) => p.program === id);

    const toggleProgram = (programId: string) => {
        const exists = isProgramSelected(programId);

        if (exists) {
            onChange({
                programs: selectedPrograms.filter(
                    (p: any) => p.program !== programId
                ),
            });
        } else {
            onChange({
                programs: [
                    ...selectedPrograms,
                    { program: programId, types: [] },
                ],
            });
        }
    };

    const toggleAllTypes = (programId: string) => {
        const program = PROGRAMS.find((p) => p.id === programId);

        const updated = selectedPrograms.map((p: any) =>
            p.program === programId
                ? {
                    ...p,
                    types: program?.types.map((t) => t.id) || [],
                }
                : p
        );

        onChange({ programs: updated });
    };

    const toggleType = (programId: string, typeId: string) => {
        const program = selectedPrograms.find(
            (p: any) => p.program === programId
        );

        if (!program) return;

        let types = program.types || [];

        if (types.includes(typeId)) {
            types = types.filter((t: string) => t !== typeId);
        } else {
            types = [...types, typeId];
        }

        const updated = selectedPrograms.map((p: any) =>
            p.program === programId ? { ...p, types } : p
        );

        onChange({ programs: updated });
    };

    const isTypeSelected = (programId: string, typeId: string) => {
        const program = selectedPrograms.find(
            (p: any) => p.program === programId
        );

        return program?.types?.includes(typeId);
    };

    const toggleAllPrograms = () => {
        if (selectedPrograms.length === PROGRAMS.length) {
            onChange({ programs: [] });
        } else {
            onChange({
                programs: PROGRAMS.map((p) => ({
                    program: p.id,
                    types: [],
                })),
            });
        }
    };

    const allProgramsSelected =
        selectedPrograms.length === PROGRAMS.length;

    return (
        <div className="space-y-6">

            {/* Select All Programs */}

            <div className="flex items-center gap-3 border-b pb-3">

                <Checkbox
                    checked={allProgramsSelected}
                    onCheckedChange={toggleAllPrograms}
                />

                <Label className="font-semibold">
                    Select All Programs
                </Label>

            </div>

            {PROGRAMS.map((program) => {
                const enabled = isProgramSelected(program.id);

                return (
                    <div
                        key={program.id}
                        className={`border rounded-md p-4 space-y-3 ${enabled ? "bg-muted/30 border-primary/30" : ""
                            }`}
                    >

                        <div className="flex items-center gap-3">

                            <Checkbox
                                checked={enabled}
                                onCheckedChange={() => toggleProgram(program.id)}
                            />

                            <Label className="font-semibold">
                                {program.label}
                            </Label>

                        </div>

                        {enabled && (
                            <div className="pl-7 space-y-2">

                                {/* All types */}

                                <div className="flex items-center gap-2">

                                    <Checkbox
                                        checked={
                                            program.types.every((t) =>
                                                isTypeSelected(program.id, t.id)
                                            )
                                        }
                                        onCheckedChange={() =>
                                            toggleAllTypes(program.id)
                                        }
                                    />

                                    <Label>All</Label>

                                </div>

                                {program.types.map((type) => (
                                    <div
                                        key={type.id}
                                        className="flex items-center gap-2"
                                    >

                                        <Checkbox
                                            checked={isTypeSelected(program.id, type.id)}
                                            onCheckedChange={() =>
                                                toggleType(program.id, type.id)
                                            }
                                        />

                                        <Label>{type.label}</Label>

                                    </div>
                                ))}

                            </div>
                        )}

                    </div>
                );
            })}
        </div>
    );
}