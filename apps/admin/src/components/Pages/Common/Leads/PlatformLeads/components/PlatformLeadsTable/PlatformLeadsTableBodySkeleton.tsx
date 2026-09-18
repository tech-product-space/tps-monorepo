import {
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  columnCount: number;
  rowCount?: number;
};

export default function PlatformLeadsTableBodySkeleton({
  columnCount,
  rowCount = 10,
}: Props) {
  return (
    <TableBody>
      {Array.from({ length: rowCount }).map((_, rowIndex) => (
        <TableRow key={rowIndex}>
          {Array.from({ length: columnCount }).map((_, colIndex) => (
            <TableCell key={colIndex}>
              <Skeleton
                className={
                  colIndex === 0
                    ? "h-4 w-4" // checkbox
                    : colIndex === columnCount - 1
                    ? "h-8 w-10" // actions
                    : "h-4 w-full"
                }
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}
