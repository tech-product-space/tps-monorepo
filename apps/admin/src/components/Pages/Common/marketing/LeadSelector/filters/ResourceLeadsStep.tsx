"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import { Search, FileText, Loader2 } from "lucide-react";

type Resource = {
    id: number;
    title: string;
    resourceType: string;
    resourceCategory: string;
    leadCount: number;
};

type ResourceFilter = {
    targetRoles?: string[];
};

type Props = {
    resources: Resource[];
    resourceTypes: string[];
    resourceCategories: string[];
    jobTitles: string[];

    loading: boolean;

    selectedResourceIds: number[];
    onToggleResource: (id: number) => void;

    resourceFilters: Record<number, ResourceFilter>;
    onFilterChange: (
        resourceId: number,
        filter: Partial<ResourceFilter>
    ) => void;
};

export default function ResourceLeadsStep({
    resources,
    resourceTypes,
    resourceCategories,
    jobTitles,
    loading,
    selectedResourceIds,
    onToggleResource,
    resourceFilters,
    onFilterChange,
}: Props) {

    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [showSelectedOnly, setShowSelectedOnly] = useState(false);

    // Snapshot of selection when the step opened — sorting by this instead of
    // the live selection keeps items from jumping to the top as they're checked.
    const [initiallySelectedIds] = useState<Set<number>>(
        () => new Set(selectedResourceIds),
    );

    /* --------------------------------
       Filter + Sort resources
    -------------------------------- */

    const filtered = resources
        .filter((r) => {

            if (search && !r.title.toLowerCase().includes(search.toLowerCase()))
                return false;

            if (typeFilter !== "all" && r.resourceType !== typeFilter)
                return false;

            if (categoryFilter !== "all" && r.resourceCategory !== categoryFilter)
                return false;

            if (showSelectedOnly && !selectedResourceIds.includes(r.id))
                return false;

            return true;

        })
        .sort((a, b) => {
            const aSelected = initiallySelectedIds.has(a.id);
            const bSelected = initiallySelectedIds.has(b.id);

            if (aSelected === bSelected) return 0;
            return aSelected ? -1 : 1;
        });

    return (
        <div className="flex flex-col h-full gap-4">

            {/* Search */}

            <div className="relative">

                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />

                <Input
                    placeholder="Search resources..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                />

            </div>

            {/* Top Filters */}

            <div className="flex gap-4">

                {/* Type */}

                <div className="flex items-center gap-2 flex-1">

                    <Label className="text-xs">Type</Label>

                    <Select value={typeFilter} onValueChange={setTypeFilter}>

                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>

                        <SelectContent>

                            <SelectItem value="all">All</SelectItem>

                            {resourceTypes.map((type) => (
                                <SelectItem key={type} value={type}>
                                    {type}
                                </SelectItem>
                            ))}

                        </SelectContent>

                    </Select>

                </div>

                {/* Category */}

                <div className="flex items-center gap-2 flex-1">

                    <Label className="text-xs">Category</Label>

                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>

                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>

                        <SelectContent>

                            <SelectItem value="all">All</SelectItem>

                            {resourceCategories.map((cat) => (
                                <SelectItem key={cat} value={cat}>
                                    {cat}
                                </SelectItem>
                            ))}

                        </SelectContent>

                    </Select>

                </div>

            </div>

            {/* Selected Toggle */}

            <div className="flex items-center gap-2 text-xs">

                <Checkbox
                    checked={showSelectedOnly}
                    onCheckedChange={(v) => setShowSelectedOnly(!!v)}
                />

                Show selected resources only

            </div>
            
            {/* Resource List */}

            <div className="flex-1 overflow-y-auto space-y-2">

                {loading && (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <Loader2 className="w-5 h-5 animate-spin mb-2" />
                        Loading resources...
                    </div>
                )}

                {!loading &&
                    filtered.map((resource) => {

                        const selected = selectedResourceIds.includes(resource.id);
                        const filter = resourceFilters[resource.id] || {};

                        return (
                            <div
                                key={resource.id}
                                className={`border rounded-lg bg-white transition ${selected
                                        ? "border-gray-400"
                                        : "border-gray-200 hover:border-gray-300"
                                    }`}
                            >

                                {/* Resource Header */}

                                <div className="flex items-start gap-3 px-4 py-3">

                                    <Checkbox
                                        checked={selected}
                                        onCheckedChange={() =>
                                            onToggleResource(resource.id)
                                        }
                                    />

                                    <div className="flex-1">

                                        <div className="font-medium text-sm flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-muted-foreground" />
                                            {resource.title}
                                        </div>

                                        <div className="text-xs text-muted-foreground flex gap-3 mt-1">
                                            <span>{resource.resourceType}</span>
                                            <span>{resource.resourceCategory}</span>
                                            <span>{resource.leadCount} leads</span>
                                        </div>

                                    </div>

                                </div>

                                {/* Role Selection */}

                                {selected && (
                                    <div className="border-t px-4 py-3 space-y-2">

                                        <Label className="text-xs">
                                            Target Roles
                                        </Label>

                                        <div className="flex flex-wrap gap-2">

                                            {/* All Roles */}

                                            <div className="flex items-center gap-1">

                                                <Checkbox
                                                    checked={
                                                        !filter.targetRoles ||
                                                        filter.targetRoles.length === 0
                                                    }
                                                    onCheckedChange={() =>
                                                        onFilterChange(resource.id, {
                                                            targetRoles: [],
                                                        })
                                                    }
                                                />

                                                <span className="text-xs">All</span>

                                            </div>

                                            {/* Job Titles */}

                                            {jobTitles.map((title) => {

                                                const roles = filter.targetRoles || [];
                                                const checked = roles.includes(title);

                                                return (
                                                    <div
                                                        key={title}
                                                        className="flex items-center gap-1"
                                                    >

                                                        <Checkbox
                                                            checked={checked}
                                                            onCheckedChange={(v) => {

                                                                let next = [...roles];

                                                                if (v) next.push(title);
                                                                else
                                                                    next = next.filter(
                                                                        (r) => r !== title
                                                                    );

                                                                onFilterChange(resource.id, {
                                                                    targetRoles: next,
                                                                });

                                                            }}
                                                        />

                                                        <span className="text-xs">
                                                            {title}
                                                        </span>

                                                    </div>
                                                );

                                            })}

                                        </div>

                                    </div>
                                )}

                            </div>
                        );

                    })}

            </div>

            {/* Footer */}

            {selectedResourceIds.length > 0 && (
                <div className="border-t pt-2 text-xs text-muted-foreground">
                    <b>{selectedResourceIds.length}</b> resource
                    {selectedResourceIds.length > 1 ? "s" : ""} selected
                </div>
            )}

        </div>
    );
}