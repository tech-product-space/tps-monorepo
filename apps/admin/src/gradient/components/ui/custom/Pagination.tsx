import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

export interface IPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface PaginationProps {
  meta: IPaginationMeta;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  maxLimit?: number;
}

const Pagination: React.FC<PaginationProps> = ({
  meta,
  onPageChange,
  onLimitChange,
}) => {
  const { page, limit, total, totalPages, hasNextPage, hasPrevPage } = meta;

  // Calculate range of items being displayed
  const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (page > 3) {
        pages.push("...");
      }

      // Show pages around current page
      const startPage = Math.max(2, page - 1);
      const endPage = Math.min(totalPages - 1, page + 1);

      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }

      if (page < totalPages - 2) {
        pages.push("...");
      }

      // Always show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const handleLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLimit = parseInt(e.target.value);
    onLimitChange(newLimit);
    // Reset to page 1 when changing limit
    onPageChange(1);
  };

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white border-t border-gray-200">
      {/* Left: Items per page */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-700">Show</span>
        <select
          value={limit}
          onChange={handleLimitChange}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:primary focus:border-transparent bg-white"
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={30}>30</option>
          <option value={50}>50</option>
        </select>
        <span className="text-sm text-gray-700">per page</span>
      </div>

      {/* Center: Page info */}
      <div className="text-sm text-gray-700">
        Showing <span className="font-medium">{startItem}</span> to{" "}
        <span className="font-medium">{endItem}</span> of{" "}
        <span className="font-medium">{total}</span> results
      </div>

      {/* Right: Page navigation */}
      <div className="flex items-center gap-2">
        {/* First page */}
        <button
          onClick={() => onPageChange(1)}
          disabled={!hasPrevPage}
          className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors cursor-pointer"
          aria-label="First page"
        >
          <ChevronsLeft className="h-4 w-4 text-gray-600" />
        </button>

        {/* Previous page */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrevPage}
          className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors cursor-pointer"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4 text-gray-600" />
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((pageNum, index) => (
            <React.Fragment key={index}>
              {pageNum === "..." ? (
                <span className="px-3 py-1.5 text-sm text-gray-500">...</span>
              ) : (
                <button
                  onClick={() => onPageChange(pageNum as number)}
                  className={`min-w-9 cursor-pointer px-3 py-1.5 text-sm rounded-md transition-colors ${
                    page === pageNum
                      ? "bg-primary text-white font-medium"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {pageNum}
                </button>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Next page */}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNextPage}
          className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors cursor-pointer"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4 text-gray-600" />
        </button>

        {/* Last page */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={!hasNextPage}
          className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors cursor-pointer"
          aria-label="Last page"
        >
          <ChevronsRight className="h-4 w-4 text-gray-600" />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
