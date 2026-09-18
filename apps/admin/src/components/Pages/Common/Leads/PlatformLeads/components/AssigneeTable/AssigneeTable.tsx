"use client";
import { useState, useEffect } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Eye,
  Download,
  ChevronDown,
  ArrowUpDown,
  ArrowLeft,
} from "lucide-react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  getPlatformLeadsByAssignee,
  updatePlatformLeadsByStatus,
} from "@/services/Leads/platformLeadServices";
import { useRouter } from "next/navigation";
import { salesPerson } from "../../data/Assignee";

type Contact = {
  id: number;
  name: string;
  email: string;
  phone: string;
  assignedTo: string;
  type: string;
  status?: string;
  additionalData: {
    linkedin: string;
  };
  createdAt: string;
  updatedAt: string;
};

const statusOptions = [
  "Not interested",
  "Positive",
  "Hot Lead",
  "Next Cohort",
  "Paid",
];

const getStatusVariant = (status: string) => {
  switch (status) {
    case "Hot Lead":
      return "destructive";
    case "Paid":
      return "default";
    case "Positive":
      return "secondary";
    case "Next Cohort":
      return "outline";
    case "Not interested":
      return "secondary";
    default:
      return "secondary";
  }
};

const AssigneeLeadsPage = () => {
  const [selectedAssignee, setSelectedAssignee] = useState<string>(
    salesPerson[0].name
  );
  const [data, setData] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const router = useRouter();

  // Fetch leads by assignee
  const fetchLeadsByAssignee = async (assigneeName: string) => {
    try {
      setLoading(true);
      const response = await getPlatformLeadsByAssignee(assigneeName);
      setData(response || []);
    } catch (error) {
      console.error("Error fetching leads:", error);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (contactId: number, newStatus: string) => {
    try {
      await updatePlatformLeadsByStatus(contactId.toString(), newStatus);
      setData((prevData) =>
        prevData.map((contact) =>
          contact.id === contactId ? { ...contact, status: newStatus } : contact
        )
      );
      console.log(`Updated contact ${contactId} status to: ${newStatus}`);
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  useEffect(() => {
    fetchLeadsByAssignee(selectedAssignee);
  }, [selectedAssignee]);

  // Stats calculation
  const getStats = () => {
    const total = data.length;
    const hotLeads = data.filter((d) => d.status === "Hot Lead").length;
    const paid = data.filter((d) => d.status === "Paid").length;
    const positive = data.filter((d) => d.status === "Positive").length;

    return { total, hotLeads, paid, positive };
  };

  const stats = getStats();

  const columns: ColumnDef<Contact>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Name
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("name")}</div>
      ),
    },
    {
      accessorKey: "email",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Email
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => (
        <div className="lowercase">{row.getValue("email")}</div>
      ),
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => <div>{row.getValue("phone")}</div>,
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const type = row.getValue("type") as string;
        const formatted = type.replace(/-/g, " ");
        const displayType =
          formatted.charAt(0).toUpperCase() + formatted.slice(1);
        return <Badge variant="outline">{displayType}</Badge>;
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const contact = row.original;
        const currentStatus = contact.status || "Not interested";

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-auto p-0">
                <Badge
                  variant={getStatusVariant(currentStatus)}
                  className="cursor-pointer hover:opacity-80"
                >
                  {currentStatus}
                </Badge>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {statusOptions.map((status) => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => handleStatusChange(contact.id, status)}
                  className={currentStatus === status ? "bg-accent" : ""}
                >
                  <Badge variant={getStatusVariant(status)} className="mr-2">
                    {status}
                  </Badge>
                  {status}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Date & Time
            <ArrowUpDown />
          </Button>
        );
      },
      cell: ({ row }) => {
        const date = new Date(row.getValue("createdAt"));
        const day = date.getDate().toString().padStart(2, "0");
        const month = date.toLocaleString("en-US", { month: "short" });
        const time = date.toLocaleString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
        return <div>{`${day} ${month} - ${time}`}</div>;
      },
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const contact = row.original;

        return (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm">
                <Eye className="h-4 w-4" />
                <span className="sr-only">View details</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Contact Details</DialogTitle>
                <DialogDescription>
                  Complete information for {contact.name}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">
                    Basic Information
                  </h4>
                  <div className="mt-2 space-y-2">
                    <div>
                      <span className="font-medium">ID:</span> {contact.id}
                    </div>
                    <div>
                      <span className="font-medium">Name:</span> {contact.name}
                    </div>
                    <div>
                      <span className="font-medium">Email:</span>{" "}
                      {contact.email}
                    </div>
                    <div>
                      <span className="font-medium">Phone:</span>{" "}
                      {contact.phone}
                    </div>
                    <div>
                      <span className="font-medium">Type:</span>{" "}
                      <Badge variant="secondary">{contact.type}</Badge>
                    </div>
                    <div>
                      <span className="font-medium">Status:</span>{" "}
                      <Badge
                        variant={getStatusVariant(
                          contact.status || "Not interested"
                        )}
                      >
                        {contact.status || "Not interested"}
                      </Badge>
                    </div>
                  </div>
                </div>

                {contact.additionalData &&
                  Object.values(contact.additionalData).some((val) => val) && (
                    <>
                      <h4 className="font-semibold text-sm text-muted-foreground">
                        Additional Information
                      </h4>
                      <div className="mt-2 space-y-2">
                        {Object.entries(contact.additionalData).map(
                          ([key, value]) =>
                            value && (
                              <div key={key}>
                                <span className="font-medium capitalize">
                                  {key}:
                                </span>{" "}
                                {value}
                              </div>
                            )
                        )}
                      </div>
                    </>
                  )}

                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">
                    Timestamps
                  </h4>
                  <div className="mt-2 space-y-2">
                    <div>
                      <span className="font-medium">Created:</span>{" "}
                      {new Date(contact.createdAt).toLocaleString()}
                    </div>
                    <div>
                      <span className="font-medium">Updated:</span>{" "}
                      {new Date(contact.updatedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      },
    },
  ];

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
  });

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-5 h-16 flex justify-between items-center border-b">
        <div className="flex items-center gap-2">
          <ArrowLeft onClick={() => router.back()} className="cursor-pointer" />
          <p className="text-lg font-semibold">Assignee Leads</p>
        </div>
      </div>

      <div className="flex flex-col h-full flex-1 overflow-auto p-5">
        <div className="w-full space-y-6">
          {/* Assignee Selection */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              Select Sales Person
            </h3>
            <div className="flex flex-wrap gap-2">
              {salesPerson.map((person) => (
                <Button
                  key={person.name}
                  variant={
                    selectedAssignee === person.name ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => setSelectedAssignee(person.name)}
                  disabled={loading}
                  style={{
                    backgroundColor:
                      selectedAssignee === person.name
                        ? person.color
                        : "transparent",
                    borderColor: person.color,
                    color:
                      selectedAssignee === person.name ? "#fff" : person.color,
                  }}
                >
                  {person.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Leads
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Hot Leads</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {stats.hotLeads}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Paid</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {stats.paid}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Positive</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {stats.positive}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters and Actions */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {loading && (
                <div className="text-sm text-muted-foreground">Loading...</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Filter by name..."
                value={
                  (table.getColumn("name")?.getFilterValue() as string) ?? ""
                }
                onChange={(event) =>
                  table.getColumn("name")?.setFilterValue(event.target.value)
                }
                className="max-w-sm"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    Columns <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {table
                    .getAllColumns()
                    .filter((column) => column.getCanHide())
                    .map((column) => {
                      return (
                        <DropdownMenuItem
                          key={column.id}
                          className="capitalize"
                          onClick={() =>
                            column.toggleVisibility(!column.getIsVisible())
                          }
                        >
                          <input
                            type="checkbox"
                            checked={column.getIsVisible()}
                            onChange={() =>
                              column.toggleVisibility(!column.getIsVisible())
                            }
                            className="mr-2"
                          />
                          {column.id}
                        </DropdownMenuItem>
                      );
                    })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Results Count */}
          <div>
            <p className="text-sm text-muted-foreground">
              Showing {table.getFilteredRowModel().rows.length} leads for{" "}
              <span className="font-semibold">{selectedAssignee}</span>
            </p>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      return (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      {loading ? "Loading..." : "No leads found."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-end space-x-2 py-4">
            <div className="text-muted-foreground flex-1 text-sm">
              Showing {table.getRowModel().rows.length} of{" "}
              {table.getFilteredRowModel().rows.length} row(s).
            </div>
            <div className="space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssigneeLeadsPage;
