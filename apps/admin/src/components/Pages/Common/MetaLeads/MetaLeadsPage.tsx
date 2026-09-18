"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { externalLeadService } from "@/services/Leads/externalLeadService"
import { Search, Loader2, SlidersHorizontal } from "lucide-react"
import { IExternalLead, ILeadType } from "@/types/externalLead"
import { SidebarTrigger } from "@/components/ui/sidebar"
import Pagination from "@/components/ui/custom/Pagination"
import { IPaginationMeta } from "@/types/pagination"
import { formatDataTime } from "@/utils/formatDataTime"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function useDebounce(value: string, delay = 300) {
    const [debounced, setDebounced] = useState(value)

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebounced(value)
        }, delay)

        return () => clearTimeout(handler)
    }, [value, delay])

    return debounced
}

export default function MetaLeadsPage() {
    const [showFilters, setShowFilters] = useState(false)

    const [leadTypes, setLeadTypes] = useState<ILeadType[]>([])
    const [selectedType, setSelectedType] = useState<string | "all">("all")

    const [leads, setLeads] = useState<IExternalLead[]>([])

    const [search, setSearch] = useState("")
    const debouncedSearch = useDebounce(search)

    const [sort, setSort] = useState<"meta" | "created">("meta")

    const [campaigns, setCampaigns] = useState<string[]>([])
    const [adsets, setAdsets] = useState<string[]>([])
    const [ads, setAds] = useState<string[]>([])

    const [campaign, setCampaign] = useState("")
    const [adset, setAdset] = useState("")
    const [ad, setAd] = useState("")

    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(20)

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [meta, setMeta] = useState<IPaginationMeta>({
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
    })

    const [viewLead, setViewLead] = useState<IExternalLead | null>(null)

    /* ---------------- FETCH LEAD TYPES ---------------- */

    const fetchLeadTypes = async () => {
        const res = await externalLeadService.getLeadTypes()
        setLeadTypes(res.types)
    }

    /* ---------------- FETCH LEADS ---------------- */

    const fetchLeads = async () => {

        try {

            setLoading(true)
            setError(null)

            const res = await externalLeadService.getMetaLeads({
                typeId: selectedType === "all" ? undefined : selectedType,
                search: debouncedSearch,
                sort,
                page,
                limit,
                campaign,
                adset,
                ad
            })

            setLeads(res.leads)

            const metaData = res.meta || {}

            setMeta({
                total: metaData.total || 0,
                page: metaData.page || page,
                limit: metaData.limit || limit,
                totalPages: metaData.totalPages || 1,
                hasNextPage: metaData.hasNextPage || false,
                hasPrevPage: metaData.hasPrevPage || false,
            })

        } catch (err) {

            console.error(err)
            setError("Failed to fetch leads")

        } finally {

            setLoading(false)

        }
    }

    const fetchFilters = async () => {
        const res = await externalLeadService.getMetaLeadFilters()

        setCampaigns(res.campaigns)
        setAdsets(res.adsets)
        setAds(res.ads)
    }

    /* ---------------- LOAD INITIAL DATA ---------------- */
    useEffect(() => {
        fetchLeadTypes()
        fetchFilters()
    }, [])

    useEffect(() => {
        fetchLeads()
    }, [selectedType, debouncedSearch, sort, page, limit])

    /* Reset page when filters change */

    useEffect(() => {
        setPage(1)
    }, [selectedType, debouncedSearch, sort])

    /* ---------------- PAGINATION ---------------- */

    const handleLimitChange = (newLimit: number) => {
        setLimit(newLimit)
        setPage(1)
    }

    const handlePageChange = (newPage: number) => {
        setPage(newPage)
    }

    
    return (

        <div className="flex flex-col gap-6 overflow-y-auto h-full">

            {/* HEADER */}

            <div className="px-8 py-5 flex items-center gap-2 border-b">
                <SidebarTrigger size={"lg"} />
                <p className="text-lg font-semibold">Meta Leads</p>
            </div>

            {/* TYPE FILTERS */}

            <div className="flex gap-2 flex-wrap px-8">

                <Button
                    variant={selectedType === "all" ? "default" : "outline"}
                    onClick={() => setSelectedType("all")}
                >
                    All
                </Button>

                {leadTypes.map(type => (
                    <Button
                        key={type.id}
                        variant={selectedType === type.id ? "default" : "outline"}
                        onClick={() => setSelectedType(type.id)}
                    >
                        {type.name}
                    </Button>
                ))}

            </div>

            {/* SEARCH + SORT */}

            <div className="px-8 flex items-center gap-4">

                {/* Search */}

                <div className="relative w-[300px]">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

                    <Input
                        placeholder="Search leads..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>

                {/* Sort */}

                <Select value={sort} onValueChange={(value: any) => setSort(value)}>
                    <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Sort" />
                    </SelectTrigger>

                    <SelectContent>
                        <SelectItem value="meta">Sort by Meta Lead Creation</SelectItem>
                        <SelectItem value="created">Sort by Lead Creation</SelectItem>
                    </SelectContent>
                </Select>

                {/* Filter Toggle Button */}

                <Button
                    onClick={() => setShowFilters(!showFilters)}
                    className="ml-auto"
                >
                    <SlidersHorizontal className="w-4 h-4 mr-2" />
                    Filters
                </Button>

            </div>

            {showFilters && (
                <div className="px-8 flex items-end gap-4 flex-wrap border p-4">

                    {/* Campaign */}

                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">Campaign</span>

                        <Select value={campaign} onValueChange={setCampaign}>
                            <SelectTrigger className="w-[220px]">
                                <SelectValue placeholder="All Campaigns" />
                            </SelectTrigger>

                            <SelectContent>

                                <SelectItem value="all">All Campaigns</SelectItem>

                                {campaigns.map(c => (
                                    <SelectItem key={c} value={c}>
                                        {c}
                                    </SelectItem>
                                ))}

                            </SelectContent>
                        </Select>

                    </div>


                    {/* Adset */}

                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">Adset</span>

                        <Select value={adset} onValueChange={setAdset}>
                            <SelectTrigger className="w-[220px]">
                                <SelectValue placeholder="All Adsets" />
                            </SelectTrigger>

                            <SelectContent>

                                <SelectItem value="all">All Adsets</SelectItem>

                                {adsets.map(a => (
                                    <SelectItem key={a} value={a}>
                                        {a}
                                    </SelectItem>
                                ))}

                            </SelectContent>
                        </Select>

                    </div>


                    {/* Ad */}

                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">Ad</span>

                        <Select value={ad} onValueChange={setAd}>
                            <SelectTrigger className="w-[220px]">
                                <SelectValue placeholder="All Ads" />
                            </SelectTrigger>

                            <SelectContent>

                                <SelectItem value="all">All Ads</SelectItem>

                                {ads.map(a => (
                                    <SelectItem key={a} value={a}>
                                        {a}
                                    </SelectItem>
                                ))}

                            </SelectContent>
                        </Select>

                    </div>


                    {/* Apply Button */}

                    <Button
                        onClick={() => {
                            setPage(1)
                            fetchLeads()
                        }}
                    >
                        Apply Filters
                    </Button>

                </div>
            )}

            {/* LEADS TABLE */}

            <Card className="mx-8">

                <CardContent className="p-0">

                    <Table>

                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead>Meta Created</TableHead>
                                <TableHead>Lead Stored</TableHead>
                                <TableHead>Action</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>

                            {loading && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-10">
                                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            Loading leads...
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}

                            {!loading && error && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-10 text-red-500">
                                        {error}
                                    </TableCell>
                                </TableRow>
                            )}

                            {!loading && !error && leads.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                        No leads found
                                    </TableCell>
                                </TableRow>
                            )}

                            {!loading && !error && leads.map(lead => (

                                <TableRow key={lead.id}>

                                    <TableCell>{lead.name || "-"}</TableCell>

                                    <TableCell>{lead.email || "-"}</TableCell>

                                    <TableCell>{lead.phone || "-"}</TableCell>

                                    <TableCell>
                                        {lead.external_created_at
                                            ? formatDataTime(lead.external_created_at)
                                            : "-"}
                                    </TableCell>

                                    <TableCell>
                                        {formatDataTime(lead.createdAt)}
                                    </TableCell>

                                    <TableCell>

                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setViewLead(lead)}
                                        >
                                            View
                                        </Button>

                                    </TableCell>

                                </TableRow>

                            ))}

                        </TableBody>

                    </Table>

                </CardContent>

            </Card>

            {/* PAGINATION */}

            <div className="p-4">

                <Pagination
                    meta={meta}
                    onPageChange={handlePageChange}
                    onLimitChange={handleLimitChange}
                />

            </div>

            {/* LEAD DETAILS */}
            <Dialog
                open={!!viewLead}
                onOpenChange={() => setViewLead(null)}
            >
                <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">

                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold">
                            Lead Details
                        </DialogTitle>
                    </DialogHeader>

                    {viewLead && (

                        <div className="space-y-6">

                            {/* META INFORMATION */}
                            <div className="border rounded-lg p-4 bg-muted/30">

                                <h3 className="font-medium mb-3 text-sm text-muted-foreground">
                                    Meta Information
                                </h3>

                                <div className="grid grid-cols-2 gap-4 text-sm">

                                    <div>
                                        <p className="text-muted-foreground text-xs">Lead ID</p>
                                        <p className="font-mono break-all">
                                            {viewLead.external_lead_id}
                                        </p>
                                    </div>

                                    <div>
                                        <p className="text-muted-foreground text-xs">Form ID</p>
                                        <p className="font-mono">
                                            {viewLead.external_form_id}
                                        </p>
                                    </div>

                                    <div>
                                        <p className="text-muted-foreground text-xs">
                                            Meta Created
                                        </p>
                                        <p>
                                            {viewLead.external_created_at
                                                ? formatDataTime(viewLead.external_created_at)
                                                : "-"}
                                        </p>
                                    </div>

                                    <div>
                                        <p className="text-muted-foreground text-xs">
                                            Lead Stored
                                        </p>
                                        <p>
                                            {formatDataTime(viewLead.createdAt)}
                                        </p>
                                    </div>

                                </div>

                            </div>


                            {/* FORM DATA */}

                            <div className="border rounded-lg p-4">

                                <h3 className="font-medium mb-4 text-sm text-muted-foreground">
                                    Form Data
                                </h3>

                                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">

                                    {Object.entries(viewLead.form_data).map(([key, value]) => (

                                        <div key={key} className="flex flex-col">

                                            <span className="text-muted-foreground text-xs capitalize">
                                                {key.replaceAll("_", " ")}
                                            </span>

                                            <span className="font-medium wrap-break-words">
                                                {String(value)}
                                            </span>

                                        </div>

                                    ))}

                                </div>

                            </div>


                            {/* ADDITIONAL META DATA */}

                            {viewLead.additional_data &&
                                Object.keys(viewLead.additional_data).length > 0 && (

                                    <div className="border rounded-lg p-4">

                                        <h3 className="font-medium mb-4 text-sm text-muted-foreground">
                                            Additional Data
                                        </h3>

                                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">

                                            {Object.entries(viewLead.additional_data).map(([key, value]) => (

                                                <div key={key} className="flex flex-col">

                                                    <span className="text-muted-foreground text-xs capitalize">
                                                        {key.replaceAll("_", " ")}
                                                    </span>

                                                    <span className="wrap-break-words">
                                                        {String(value)}
                                                    </span>

                                                </div>

                                            ))}

                                        </div>

                                    </div>

                                )}

                        </div>

                    )}

                </DialogContent>
            </Dialog>

        </div>
    )
}