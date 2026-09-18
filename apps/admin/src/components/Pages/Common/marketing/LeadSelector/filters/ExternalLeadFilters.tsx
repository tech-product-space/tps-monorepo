"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { externalLeadService } from "@/services/Leads/externalLeadService";
import { ILeadType } from "@/types/externalLead";
import { useEffect, useState } from "react";

type Props = {
    types: ILeadType[];
    value: any;
    onChange: (filters: any) => void;
};

type FilterKey = "campaigns" | "adsets" | "ads";

type FilterConfig = {
    key: FilterKey;
    label: string;
    values: string[];
};

const EXTERNAL_SOURCES = [{ id: "meta", label: "Meta Leads" }];

export default function ExternalLeadFilters({
    types,
    value,
    onChange,
}: Props) {
    const [metaFilters, setMetaFilters] = useState<{
        campaigns: string[];
        adsets: string[];
        ads: string[];
    }>({
        campaigns: [],
        adsets: [],
        ads: [],
    });

    const [search, setSearch] = useState({
        types: "",
        campaigns: "",
        adsets: "",
        ads: "",
    });

    useEffect(() => {
        const fetchMetaFilters = async () => {
            const res = await externalLeadService.getMetaLeadFilters();
            setMetaFilters(res);
        };

        fetchMetaFilters();
    }, []);

    const selectedSources = value?.sources || [];

    const isSourceSelected = (src: string) =>
        selectedSources.some((s: any) => s.source === src);

    const toggleSource = (src: string) => {
        const exists = isSourceSelected(src);

        if (exists) {
            onChange({
                sources: selectedSources.filter((s: any) => s.source !== src),
            });
        } else {
            onChange({
                sources: [
                    ...selectedSources,
                    {
                        source: src,
                        types: [],
                        filters: {
                            campaigns: [],
                            adsets: [],
                            ads: [],
                        },
                    },
                ],
            });
        }
    };

    const updateSource = (src: string, updater: any) => {
        const updated = selectedSources.map((s: any) =>
            s.source === src ? updater(s) : s
        );

        onChange({ sources: updated });
    };

    const toggleType = (src: string, typeId: string) => {
        const source = selectedSources.find((s: any) => s.source === src);
        if (!source) return;

        let updatedTypes = source.types || [];

        if (updatedTypes.includes(typeId)) {
            updatedTypes = updatedTypes.filter((t: string) => t !== typeId);
        } else {
            updatedTypes = [...updatedTypes, typeId];
        }

        updateSource(src, (s: any) => ({
            ...s,
            types: updatedTypes,
        }));
    };

    const toggleAllTypes = (src: string) => {
        const allIds = types.map((t) => t.id);

        updateSource(src, (s: any) => ({
            ...s,
            types: allIds,
        }));
    };

    const toggleFilterValue = (
        src: string,
        filterKey: FilterKey,
        value: string
    ) => {
        const source = selectedSources.find((s: any) => s.source === src);
        if (!source) return;

        const existing = source.filters?.[filterKey] || [];

        let updatedValues;

        if (existing.includes(value)) {
            updatedValues = existing.filter((v: string) => v !== value);
        } else {
            updatedValues = [...existing, value];
        }

        updateSource(src, (s: any) => ({
            ...s,
            filters: {
                ...s.filters,
                [filterKey]: updatedValues,
            },
        }));
    };

    const toggleAllFilters = (src: string, filterKey: FilterKey) => {
        updateSource(src, (s: any) => ({
            ...s,
            filters: {
                ...s.filters,
                [filterKey]: [],
            },
        }));
    };

    const filterTypes = () => {
        const filtered = types.filter((t) =>
            t.name.toLowerCase().includes(search.types.toLowerCase())
        );

        return search.types ? filtered : filtered.slice(0, 5);
    };

    const filterValues = (list: string[], key: FilterKey) => {
        const filtered = list.filter((v) =>
            v.toLowerCase().includes(search[key].toLowerCase())
        );

        return search[key] ? filtered : filtered.slice(0, 5);
    };

    const FILTERS: FilterConfig[] = [
        { key: "campaigns", label: "Campaigns", values: metaFilters.campaigns },
        { key: "adsets", label: "Adsets", values: metaFilters.adsets },
        { key: "ads", label: "Ads", values: metaFilters.ads },
    ];

    
    return (
        <div className="space-y-6">
            {EXTERNAL_SOURCES.map((src) => {
                const enabled = isSourceSelected(src.id);

                const source = selectedSources.find((s: any) => s.source === src.id);

                return (
                    <div
                        key={src.id}
                        className={`border rounded-md p-4 space-y-4 ${enabled ? "bg-muted/30 border-primary/30" : ""
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <Checkbox
                                checked={enabled}
                                onCheckedChange={() => toggleSource(src.id)}
                            />
                            <Label className="font-semibold">{src.label}</Label>
                        </div>

                        {enabled && (
                            <div className="pl-6 space-y-6">
                                {/* TYPES */}

                                <div className="space-y-2">
                                    <Label className="font-semibold">Lead Types</Label>

                                    <Input
                                        placeholder="Search Types"
                                        value={search.types}
                                        onChange={(e) =>
                                            setSearch({
                                                ...search,
                                                types: e.target.value,
                                            })
                                        }
                                    />

                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            checked={
                                                types.length > 0 &&
                                                types.every((t) => source?.types?.includes(t.id))
                                            }
                                            onCheckedChange={() => toggleAllTypes(src.id)}
                                        />

                                        <Label>All Types</Label>
                                    </div>

                                    {filterTypes().map((type) => (
                                        <div key={type.id} className="flex items-center gap-2">
                                            <Checkbox
                                                checked={source?.types?.includes(type.id)}
                                                onCheckedChange={() =>
                                                    toggleType(src.id, type.id)
                                                }
                                            />

                                            <Label>{type.name}</Label>
                                        </div>
                                    ))}

                                    {!search.types && types.length > 5 && (
                                        <p className="text-xs text-muted-foreground">
                                            Showing 5 of {types.length}. Search to see more.
                                        </p>
                                    )}
                                </div>

                                {/* FILTERS */}

                                {FILTERS.map((filter) => {
                                    const values = filterValues(filter.values, filter.key);

                                    return (
                                        <div key={filter.key} className="space-y-2">
                                            <Label className="font-semibold">{filter.label}</Label>

                                            <Input
                                                placeholder={`Search ${filter.label}`}
                                                value={search[filter.key]}
                                                onChange={(e) =>
                                                    setSearch({
                                                        ...search,
                                                        [filter.key]: e.target.value,
                                                    })
                                                }
                                            />

                                            <div className="flex items-center gap-2">
                                                <Checkbox
                                                    checked={
                                                        !(source?.filters?.[filter.key]?.length)
                                                    }
                                                    onCheckedChange={() =>
                                                        toggleAllFilters(src.id, filter.key)
                                                    }
                                                />

                                                <Label>All {filter.label}</Label>
                                            </div>

                                            {values.map((val) => (
                                                <div key={val} className="flex items-center gap-2">
                                                    <Checkbox
                                                        checked={source?.filters?.[
                                                            filter.key
                                                        ]?.includes(val)}
                                                        onCheckedChange={() =>
                                                            toggleFilterValue(
                                                                src.id,
                                                                filter.key,
                                                                val
                                                            )
                                                        }
                                                    />
                                                    <Label>{val}</Label>
                                                </div>
                                            ))}

                                            {!search[filter.key] &&
                                                filter.values.length > 5 && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Showing 5 of {filter.values.length}. Search to see
                                                        more.
                                                    </p>
                                                )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}