import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "@/components/atoms/icons";
import { Button } from "@/components/atoms/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { PAGE_SIZES } from "@/constants";
import { formatCount } from "@/utils/data/format";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange(page: number): void;
  onPageSizeChange(size: number): void;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <nav aria-label="Pages" className="flex items-center gap-1">
      <span className="q-num mr-2 text-xs text-ink-muted max-sm:hidden">
        {formatCount(from)}–{formatCount(to)} of {formatCount(total)}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={page === 0}
        onClick={() => onPageChange(0)}
        aria-label="First page"
      >
        <ChevronFirst />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft />
      </Button>
      <span className="q-num px-1 font-mono text-xs text-ink-soft">
        {page + 1}/{pages}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={page >= pages - 1}
        onClick={() => onPageChange(page + 1)}
        aria-label="Next page"
      >
        <ChevronRight />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={page >= pages - 1}
        onClick={() => onPageChange(pages - 1)}
        aria-label="Last page"
      >
        <ChevronLast />
      </Button>
      <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
        <SelectTrigger
          size="sm"
          className="ml-1 w-auto gap-1 font-mono text-xs"
          aria-label="Rows per page"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {PAGE_SIZES.map((s) => (
            <SelectItem key={s} value={String(s)}>
              {s} / page
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </nav>
  );
}
