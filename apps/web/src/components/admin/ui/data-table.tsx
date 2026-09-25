'use client';

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type Row,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Rows3, Rows4, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';
import { IconButton } from './button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from './dropdown-menu';
import { EmptyState, Skeleton } from './feedback';
import { Pagination } from './filters';
import { Checkbox } from './toggles';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Text alignment for header and cells. */
    align?: 'left' | 'right' | 'center';
    /** Extra classes for every cell in this column. */
    className?: string;
    headerClassName?: string;
    /** Label in the column visibility menu (defaults to the header when it is a string). */
    label?: string;
    /** Allow hiding from the column menu. Default true. */
    hideable?: boolean;
    /** Fixed width, like '8rem'. */
    width?: string;
    /** Clicking cells in this column does not trigger onRowClick (menus, buttons). */
    stopRowClick?: boolean;
  }
}

export type Density = 'comfortable' | 'compact';

export interface DataTablePagination {
  /** 1-based page (matches the API). */
  page: number;
  pageSize: number;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  data: T[] | undefined;
  /** Stable row id (needed for selection across pages). */
  getRowId?: (row: T, index: number) => string;
  /** Skeleton rows while the first page loads. */
  loading?: boolean;
  /** Subtle dim while refetching with data on screen. */
  fetching?: boolean;
  /** Shown when there are no rows (default: a friendly EmptyState). */
  empty?: ReactNode;

  /** Server-driven pagination: pass `total` + `pagination` + `onPaginationChange`. Omit for client pagination. */
  total?: number;
  pagination?: DataTablePagination;
  onPaginationChange?: (p: DataTablePagination) => void;
  /** Client-side page size (when not server driven). Default 20. `false` disables pagination. */
  clientPageSize?: number | false;
  pageSizes?: number[];
  noun?: string;

  /** Server-driven sorting: pass both. Otherwise sorting happens in the browser. */
  sorting?: SortingState;
  onSortingChange?: (s: SortingState) => void;

  /** Row checkboxes + a floating bulk action bar. */
  selectable?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (s: RowSelectionState) => void;
  /** Buttons for the bulk bar. Receives selected rows (on this page) and ids (all pages). */
  bulkActions?: (ctx: { rows: T[]; ids: string[]; clear: () => void }) => ReactNode;

  onRowClick?: (row: T, e: MouseEvent | KeyboardEvent) => void;
  /** Highlight a row (the one open in a Sheet). */
  activeRowId?: string | null;

  /** Persist column visibility and density in localStorage under this key. */
  storageKey?: string;
  initialColumnVisibility?: VisibilityState;
  defaultDensity?: Density;
  /** Show the columns + density controls. Default true. */
  showViewOptions?: boolean;
  /** Toolbar content on the left of the view options (search, filters). */
  toolbar?: ReactNode;
  /** Max height of the scroll area; the header sticks inside it. `null` = grow with the page. */
  maxHeight?: string | null;
  className?: string;
  'aria-label'?: string;
}

function readStore<T>(key: string | undefined, fallback: T): T {
  if (!key || typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(`zemi.table.${key}`);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

/**
 * The admin table (TanStack Table v8).
 *
 * @example Server mode
 * <DataTable columns={cols} data={q.data?.items} total={q.data?.total} loading={q.isPending} fetching={q.isFetching}
 *   pagination={{ page, pageSize }} onPaginationChange={({ page, pageSize }) => setParams({ page, pageSize })}
 *   sorting={sorting} onSortingChange={setSorting} getRowId={(r) => r.id}
 *   selectable bulkActions={({ ids, clear }) => <Button onClick={() => resend(ids).then(clear)}>Resend tickets</Button>}
 *   onRowClick={(r) => router.push(adminRoutes.event(r.id))} storageKey="events" noun="events" />
 */
export function DataTable<T>({
  columns,
  data,
  getRowId,
  loading,
  fetching,
  empty,
  total,
  pagination,
  onPaginationChange,
  clientPageSize = 20,
  pageSizes,
  noun = 'rows',
  sorting: sortingProp,
  onSortingChange,
  selectable,
  rowSelection: rowSelectionProp,
  onRowSelectionChange,
  bulkActions,
  onRowClick,
  activeRowId,
  storageKey,
  initialColumnVisibility,
  defaultDensity = 'comfortable',
  showViewOptions = true,
  toolbar,
  maxHeight = 'max(22rem, calc(100dvh - 13rem))',
  className,
  'aria-label': ariaLabel,
}: DataTableProps<T>) {
  const serverPaging = pagination !== undefined && onPaginationChange !== undefined;
  const serverSorting = sortingProp !== undefined && onSortingChange !== undefined;

  const [innerSorting, setInnerSorting] = useState<SortingState>([]);
  const [innerSelection, setInnerSelection] = useState<RowSelectionState>({});
  const [clientPage, setClientPage] = useState({ pageIndex: 0, pageSize: clientPageSize || 20 });
  const [prefs, setPrefs] = useState<{ visibility: VisibilityState; density: Density }>({
    visibility: initialColumnVisibility ?? {},
    density: defaultDensity,
  });
  useEffect(() => {
    setPrefs((p) => readStore(storageKey, p));
  }, [storageKey]);
  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(`zemi.table.${storageKey}`, JSON.stringify(prefs));
    } catch {
      /* private mode */
    }
  }, [prefs, storageKey]);

  const sorting = serverSorting ? sortingProp! : innerSorting;
  const rowSelection = rowSelectionProp ?? innerSelection;

  const onSorting: OnChangeFn<SortingState> = (u) => {
    const next = typeof u === 'function' ? u(sorting) : u;
    if (serverSorting) {
      onSortingChange!(next);
      if (serverPaging && pagination!.page !== 1) onPaginationChange!({ ...pagination!, page: 1 });
    } else setInnerSorting(next);
  };
  const onSelection: OnChangeFn<RowSelectionState> = (u) => {
    const next = typeof u === 'function' ? u(rowSelection) : u;
    if (onRowSelectionChange) onRowSelectionChange(next);
    if (rowSelectionProp === undefined) setInnerSelection(next);
  };

  const allColumns = useMemo<ColumnDef<T, any>[]>(() => {  // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!selectable) return columns;
    const select: ColumnDef<T, unknown> = {
      id: '__select',
      enableSorting: false,
      enableHiding: false,
      meta: { width: '2.75rem', stopRowClick: true, hideable: false },
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all rows on this page"
          checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
          onCheckedChange={(c) => table.toggleAllPageRowsSelected(c)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox aria-label="Select row" checked={row.getIsSelected()} onCheckedChange={(c) => row.toggleSelected(c)} disabled={!row.getCanSelect()} />
      ),
    };
    return [select, ...columns];
  }, [columns, selectable]);

  const rows = data ?? [];
  const table = useReactTable<T>({
    data: rows,
    columns: allColumns,
    getRowId,
    state: {
      sorting,
      rowSelection,
      columnVisibility: prefs.visibility,
      ...(serverPaging ? {} : clientPageSize ? { pagination: clientPage } : {}),
    },
    enableRowSelection: Boolean(selectable),
    onSortingChange: onSorting,
    onRowSelectionChange: onSelection,
    onColumnVisibilityChange: (u) => setPrefs((p) => ({ ...p, visibility: typeof u === 'function' ? u(p.visibility) : u })),
    onPaginationChange: (u) => setClientPage((p) => (typeof u === 'function' ? u(p) : u)),
    manualSorting: serverSorting,
    manualPagination: serverPaging,
    rowCount: serverPaging ? total : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: serverSorting ? undefined : getSortedRowModel(),
    getPaginationRowModel: serverPaging || !clientPageSize ? undefined : getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  const visibleRows = table.getRowModel().rows;
  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const compact = prefs.density === 'compact';
  const colCount = table.getVisibleLeafColumns().length;
  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide() && c.columnDef.meta?.hideable !== false && c.id !== '__select');

  const clear = () => onSelection({});

  const handleRowClick = (row: Row<T>, e: MouseEvent<HTMLTableRowElement>) => {
    if (!onRowClick) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, label, [role="checkbox"], [role="menuitem"], [data-stop-row-click]')) return;
    if (window.getSelection()?.toString()) return;
    onRowClick(row.original, e);
  };

  const pageTotal = serverPaging ? (total ?? 0) : rows.length;
  const showPagination = serverPaging ? pageTotal > 0 : Boolean(clientPageSize) && rows.length > (clientPageSize || 0);

  return (
    <div className={cn('min-w-0 space-y-3', className)}>
      {toolbar || showViewOptions ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>
          {showViewOptions ? (
            <div className="flex items-center gap-1">
              {hideable.length ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton label="Columns" variant="secondary" size="md">
                      <Columns3 />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56">
                    <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                    {hideable.map((c) => (
                      <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(Boolean(v))}>
                        {c.columnDef.meta?.label ?? (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id)}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              <IconButton
                label={compact ? 'Comfortable rows' : 'Compact rows'}
                variant="secondary"
                aria-pressed={compact}
                onClick={() => setPrefs((p) => ({ ...p, density: p.density === 'compact' ? 'comfortable' : 'compact' }))}
              >
                {compact ? <Rows3 /> : <Rows4 />}
              </IconButton>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          'relative overflow-auto rounded-[20px] border border-line bg-white transition-opacity',
          fetching && !loading && 'opacity-70',
        )}
        style={maxHeight ? { maxHeight } : undefined}
        tabIndex={-1}
      >
        <table className="w-full border-separate border-spacing-0 text-left text-[0.9375rem]" aria-label={ariaLabel} aria-busy={loading || fetching || undefined}>
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const meta = h.column.columnDef.meta;
                  const sort = h.column.getIsSorted();
                  const canSort = h.column.getCanSort();
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : canSort ? 'none' : undefined}
                      className={cn(
                        'border-b border-line bg-surface-muted/95 px-4 text-[0.8125rem] font-semibold whitespace-nowrap text-ink-3 backdrop-blur first:pl-5 last:pr-5',
                        compact ? 'h-9' : 'h-11',
                        meta?.align === 'right' && 'text-right',
                        meta?.align === 'center' && 'text-center',
                        meta?.headerClassName,
                      )}
                      style={{ width: meta?.width }}
                    >
                      {h.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className={cn(
                            'group -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-focus',
                            sort && 'text-ink',
                            meta?.align === 'right' && 'flex-row-reverse',
                          )}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sort === 'asc' ? (
                            <ArrowUp className="size-3.5" />
                          ) : sort === 'desc' ? (
                            <ArrowDown className="size-3.5" />
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
                          )}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading && !rows.length ? (
              Array.from({ length: 6 }, (_, i) => (
                <tr key={`sk${i}`}>
                  {Array.from({ length: colCount }, (_, j) => (
                    <td key={j} className={cn('border-b border-line px-4 first:pl-5 last:pr-5', compact ? 'h-10' : 'h-14')}>
                      <Skeleton className={cn('h-3.5', j === 0 ? 'w-4/5' : j % 2 ? 'w-1/2' : 'w-2/3')} />
                    </td>
                  ))}
                </tr>
              ))
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="p-3">
                  {empty ?? <EmptyState framed={false} size="sm" title="Nothing here yet" description="When there is something to show, it lands here." />}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const selected = row.getIsSelected();
                const active = activeRowId != null && row.id === activeRowId;
                return (
                  <tr
                    key={row.id}
                    data-state={selected ? 'selected' : undefined}
                    onClick={onRowClick ? (e) => handleRowClick(row, e) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.target !== e.currentTarget) return;
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onRowClick(row.original, e);
                            }
                          }
                        : undefined
                    }
                    tabIndex={onRowClick ? 0 : undefined}
                    className={cn(
                      'group/row transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-surface-muted/70 focus-visible:bg-blue-50/50 focus-visible:outline-none',
                      selected && 'bg-blue-50/60 hover:bg-blue-50/80',
                      active && 'bg-blue-50/70',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <td
                          key={cell.id}
                          data-stop-row-click={meta?.stopRowClick ? '' : undefined}
                          className={cn(
                            'border-b border-line px-4 align-middle text-ink first:pl-5 last:pr-5 group-last/row:border-b-0',
                            compact ? 'h-10 py-1.5 text-sm' : 'h-14 py-2.5',
                            meta?.align === 'right' && 'text-right tabular-nums',
                            meta?.align === 'center' && 'text-center',
                            meta?.className,
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showPagination ? (
        <Pagination
          page={serverPaging ? pagination!.page : clientPage.pageIndex + 1}
          pageSize={serverPaging ? pagination!.pageSize : clientPage.pageSize}
          total={pageTotal}
          noun={noun}
          pageSizes={pageSizes}
          onPageChange={(p) => (serverPaging ? onPaginationChange!({ ...pagination!, page: p }) : setClientPage((c) => ({ ...c, pageIndex: p - 1 })))}
          onPageSizeChange={(size) =>
            serverPaging ? onPaginationChange!({ page: 1, pageSize: size }) : setClientPage({ pageIndex: 0, pageSize: size })
          }
        />
      ) : null}

      <AnimatePresence>
        {selectable && selectedIds.length > 0 ? (
          <motion.div
            role="region"
            aria-label="Bulk actions"
            initial={{ y: 24, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-[22px] bg-ink py-2 pr-2 pl-4 text-white shadow-[var(--shadow-3)] sm:inset-x-auto sm:left-1/2 sm:w-max sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:flex-nowrap sm:rounded-full"
          >
            <span className="text-sm font-semibold whitespace-nowrap tabular-nums" aria-live="polite">
              {selectedIds.length.toLocaleString('en-US')} selected
            </span>
            <span className="mx-1 hidden h-5 w-px bg-white/20 sm:block" aria-hidden="true" />
            <div className="flex flex-1 flex-wrap items-center gap-1.5 [&_button]:h-8 [&_button]:text-sm">
              {bulkActions?.({ rows: selectedRows, ids: selectedIds, clear })}
            </div>
            <button
              type="button"
              onClick={clear}
              aria-label="Clear selection"
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
            >
              <X className="size-4" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export type { ColumnDef, SortingState, RowSelectionState, VisibilityState };
