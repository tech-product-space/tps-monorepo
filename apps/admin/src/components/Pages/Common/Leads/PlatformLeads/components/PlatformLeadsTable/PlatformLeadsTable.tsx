"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";

import { formatDataTime } from "@/utils/formatDataTime";
import { salesPerson } from "../../data/Assignee";
import { getStatusVariant, statusOptions } from "../../data/leadTable";
import type { ILead } from "../../types/leads";
import { Eye, Trash2 } from "lucide-react";
import {
    ColumnDef,
    ColumnOrderState,
    flexRender,
    getCoreRowModel,
    RowSelectionState,
    useReactTable,
    VisibilityState,
} from "@tanstack/react-table";
import { useMemo } from "react";
import LeadTypeBadge from "./LeadTypeBadge";
import PlatformLeadsTableBodySkeleton from "./PlatformLeadsTableBodySkeleton";

const getAssigneeColor = (name: string) => {
    const person = salesPerson.find((p) => p.name === name);
    if (person) return person.color;
    return "#888";
};

type Props = {
    data: ILead[];
    rowSelection: RowSelectionState;
    onRowSelectionChange: (updater: any) => void;

    columnVisibility: VisibilityState;
    onColumnVisibilityChange: (updater: any) => void;

    columnOrder: ColumnOrderState;
    onColumnOrderChange: (updater: any) => void;

    showTypeColumn: boolean;
    onAssigneeChange: (id: string | number, v: string) => void;
    onStatusChange: (id: string | number, v: string) => void;
    onView?: (lead: ILead) => void;
    onDelete?: (lead: ILead) => void;
    loading?: boolean;
    skeletonRows?: number;
};


export default function PlatformLeadsTable({
    data,
    rowSelection,
    onRowSelectionChange,
    columnVisibility,
    onColumnVisibilityChange,
    columnOrder,
    onColumnOrderChange,
    onAssigneeChange,
    onStatusChange,
    onView,
    onDelete,
    showTypeColumn,
    loading,
    skeletonRows,
}: Props) {
    const typeColumn: ColumnDef<ILead> = {
        id: "type",
        header: "Source",
        cell: ({ row }) => {
            return <LeadTypeBadge type={row.original.type} />;
        },
    };

    const columns: ColumnDef<ILead>[] = [
        {
            id: "select",
            header: ({ table }) => (
                <Checkbox
                    checked={table.getIsAllPageRowsSelected()}
                    onCheckedChange={(value) =>
                        table.toggleAllPageRowsSelected(!!value)
                    }
                />
            ),
            cell: ({ row }) => (
                <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                />
            ),
        },
        { accessorKey: "name", header: "Name" },
        { accessorKey: "email", header: "Email" },
        { accessorKey: "phone", header: "Phone" },

        ...(showTypeColumn ? [typeColumn] : []),

        // Assignee
        {
            id: "assignee",
            header: "Assignee",
            cell: ({ row }) => {
                const lead = row.original;

                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost">
                                <Badge
                                    style={{
                                        backgroundColor: getAssigneeColor(
                                            lead.assignedTo || "none"
                                        ),
                                        color: "#fff",
                                    }}
                                >
                                    {lead.assignedTo || "none"}
                                </Badge>
                            </Button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent>
                            {salesPerson.map((person) => (
                                <DropdownMenuItem
                                    key={person.name}
                                    onClick={() =>
                                        onAssigneeChange(lead.id, person.name)
                                    }
                                >
                                    {person.name}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            },
        },

        // status
        {
            id: "status",
            header: "Status",
            cell: ({ row }) => {
                const lead = row.original;

                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost">
                                <Badge variant={getStatusVariant(
                                    lead.status || "Not interested"
                                )}>
                                    {lead.status || "Not interested"}
                                </Badge>
                            </Button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent>
                            {statusOptions.map((status) => (
                                <DropdownMenuItem
                                    key={status}
                                    onClick={() =>
                                        onStatusChange(lead.id, status)
                                    }
                                >
                                    {status}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            },
        },

        //timestamp
        {
            accessorKey: "createdAt",
            header: "Date & Time",
            cell: ({ getValue }) => {
                const value = getValue() as string;
                return formatDataTime(value);
            },
        },

        // Actions
        {
            id: "actions",
            header: "Actions",
            cell: ({ row }) => {
                const lead = row.original;

                return (
                    <div className="flex gap-2">
                        {onView && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onView(lead)}
                            >
                                <Eye className="w-4 h-4" />
                            </Button>
                        )}

                        {onDelete && (
                            <Button
                                variant="ghost"
                                className="text-red-600"
                                onClick={() => onDelete(lead)}
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        )}
                    </div>
                );
            },
        },
    ];

    const finalColumnOrder = useMemo(() => {
        return [
            "select",
            ...columnOrder,
            "actions",
        ];
    }, [columnOrder]);

    const table = useReactTable({
        data,
        columns,
        state: {
            rowSelection,
            columnVisibility,
            columnOrder: finalColumnOrder,
        },
        onRowSelectionChange,
        onColumnVisibilityChange,
        onColumnOrderChange,
        getRowId: (row) => String(row.id),
        getCoreRowModel: getCoreRowModel(),
    });

    if (data.length === 0) return null;

    return (
        <Table>
            <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                            <TableHead key={header.id}>
                                {flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                )}
                            </TableHead>
                        ))}
                    </TableRow>
                ))}
            </TableHeader>

            {loading ? (
                <PlatformLeadsTableBodySkeleton
                    columnCount={table.getVisibleLeafColumns().length}
                    rowCount={skeletonRows}
                />
            ) : (
                <TableBody>
                    {table.getRowModel().rows.map((row) => (
                        <TableRow
                            key={row.id}
                            data-state={row.getIsSelected() && "selected"}
                        >
                            {row.getVisibleCells().map((cell) => (
                                <TableCell key={cell.id}>
                                    {flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext()
                                    )}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            )}

        </Table>
    );
}
