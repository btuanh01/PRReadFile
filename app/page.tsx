"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Moon,
  Sun,
  Filter,
  ArrowUpDown,
  X,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DuplicateGroup, ParseResult, Transaction } from "@/lib/parser";
import { useAnalyzer } from "@/lib/use-analyzer";
import { useTheme } from "@/lib/use-theme";
import { formatAmount, parseDDMMYYYY, isoToMs } from "@/lib/format";

const STORAGE_KEY = "bsa.last-result";
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const PAGE_SIZE = 200;

type SortKey = "date" | "amount" | "description";
type SortDir = "asc" | "desc";

interface Filters {
  search: string;
  type: "all" | "credit" | "debit";
  duplicatesOnly: boolean;
  dateFrom: string; // ISO yyyy-mm-dd
  dateTo: string;
  minAmount: string;
  maxAmount: string;
}

const emptyFilters: Filters = {
  search: "",
  type: "all",
  duplicatesOnly: false,
  dateFrom: "",
  dateTo: "",
  minAmount: "",
  maxAmount: "",
};

export default function Home() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { result, isAnalyzing, error, analyze, reset, setResult } = useAnalyzer();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [visibleRows, setVisibleRows] = useState(PAGE_SIZE);
  const [keepIds, setKeepIds] = useState<Record<string, string>>({}); // groupId → txId to keep
  const [showFilters, setShowFilters] = useState(false);

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: ParseResult = JSON.parse(saved);
        if (parsed?.transactions?.length) setResult(parsed);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on result change
  useEffect(() => {
    try {
      if (result) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, [result]);

  // Initialize keep-selection: by default, keep the first occurrence of each group.
  useEffect(() => {
    if (!result) return;
    const keep: Record<string, string> = {};
    for (const tx of result.transactions) {
      if (tx.duplicateGroupId && !keep[tx.duplicateGroupId]) {
        keep[tx.duplicateGroupId] = tx.id;
      }
    }
    setKeepIds(keep);
  }, [result]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!acceptedFiles.length) return;
      const total = acceptedFiles.reduce((s, f) => s + f.size, 0);
      if (total > MAX_TOTAL_BYTES) {
        toast.error(`Total ${(total / 1024 / 1024).toFixed(1)}MB is over the limit. Split into smaller batches.`);
        return;
      }
      const valid = acceptedFiles.filter((f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls"));
      if (!valid.length) {
        toast.error("Please upload Excel files (.xlsx or .xls)");
        return;
      }
      try {
        const r = await analyze(valid);
        toast.success(`Found ${r.total} transactions • ${r.duplicates} duplicates in ${r.groups.length} groups`);
      } catch (e: any) {
        toast.error(e?.message || "Analysis failed");
      }
    },
    [analyze],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    multiple: true,
  });

  // Index duplicate groups → transactions once.
  const groupTxMap = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    if (!result) return m;
    for (const tx of result.transactions) {
      if (!tx.duplicateGroupId) continue;
      const arr = m.get(tx.duplicateGroupId) || [];
      arr.push(tx);
      m.set(tx.duplicateGroupId, arr);
    }
    return m;
  }, [result]);

  // Apply filters + sort.
  const filtered = useMemo(() => {
    if (!result) return [] as Transaction[];
    const search = filters.search.trim().toUpperCase();
    const fromMs = filters.dateFrom ? isoToMs(filters.dateFrom) : 0;
    const toMs = filters.dateTo ? isoToMs(filters.dateTo) + 86_400_000 - 1 : Number.MAX_SAFE_INTEGER;
    const minA = filters.minAmount ? Number(filters.minAmount) : -Infinity;
    const maxA = filters.maxAmount ? Number(filters.maxAmount) : Infinity;

    let list = result.transactions.filter((tx) => {
      if (filters.duplicatesOnly && !tx.isDuplicate) return false;
      if (filters.type !== "all" && tx.type !== filters.type) return false;
      if (search) {
        const hay = `${tx.description} ${tx.details ?? ""} ${tx.sourceFile ?? ""}`.toUpperCase();
        if (!hay.includes(search)) return false;
      }
      if (fromMs || toMs !== Number.MAX_SAFE_INTEGER) {
        const ms = parseDDMMYYYY(tx.date);
        if (ms < fromMs || ms > toMs) return false;
      }
      if (tx.amount < minA || tx.amount > maxA) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      // Duplicates always pinned to the top
      if (a.isDuplicate !== b.isDuplicate) return a.isDuplicate ? -1 : 1;
      // Cluster rows of the same duplicate group together
      if (a.isDuplicate && b.isDuplicate && a.duplicateGroupId !== b.duplicateGroupId) {
        return (a.duplicateGroupId || "").localeCompare(b.duplicateGroupId || "");
      }
      let cmp = 0;
      if (sortKey === "date") cmp = parseDDMMYYYY(a.date) - parseDDMMYYYY(b.date);
      else if (sortKey === "amount") cmp = a.amount - b.amount;
      else cmp = a.description.localeCompare(b.description);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [result, filters, sortKey, sortDir]);

  // Reset window when filters/sort change
  useEffect(() => {
    setVisibleRows(PAGE_SIZE);
  }, [filters, sortKey, sortDir]);

  const visible = filtered.slice(0, visibleRows);

  const totals = useMemo(() => {
    if (!result) return { credit: 0, debit: 0, net: 0 };
    let credit = 0;
    let debit = 0;
    for (const tx of result.transactions) {
      if (tx.type === "credit") credit += tx.amount;
      else debit += tx.amount;
    }
    return { credit, debit, net: credit - debit };
  }, [result]);

  const setSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  };

  const downloadCSV = () => {
    if (!result) return;
    const finalTransactions: Transaction[] = [];
    const seenGroups = new Set<string>();
    for (const tx of result.transactions) {
      if (!tx.duplicateGroupId) {
        finalTransactions.push(tx);
        continue;
      }
      const keep = keepIds[tx.duplicateGroupId];
      if (keep === tx.id) {
        finalTransactions.push(tx);
        seenGroups.add(tx.duplicateGroupId);
      } else if (!keep && !seenGroups.has(tx.duplicateGroupId)) {
        // Fallback: first occurrence
        finalTransactions.push(tx);
        seenGroups.add(tx.duplicateGroupId);
      }
    }

    const headers = ["Source", "Date", "Description", "Details", "Debit", "Credit", "Balance"];
    const csv = [
      headers.join(","),
      ...finalTransactions.map((tx) =>
        [
          `"${tx.sourceFile ?? ""}"`,
          `"${tx.date}"`,
          `"${tx.description.replace(/"/g, '""')}"`,
          `"${(tx.details || "").replace(/"/g, '""')}"`,
          tx.type === "debit" ? tx.amount.toFixed(0) : "",
          tx.type === "credit" ? tx.amount.toFixed(0) : "",
          tx.balance.toFixed(0),
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clean_transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    setFilters(emptyFilters);
    reset();
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  // ============ RENDER ============

  if (!result && !isAnalyzing) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-muted/20 p-8">
        <div className="absolute right-4 top-4">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold">Bank Statement Analyzer</CardTitle>
            <CardDescription>
              Drop one or more Excel statements (.xlsx). Parsing runs locally in your browser — files never leave your device.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={cn(
                "cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition-colors",
                isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
              )}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center space-y-4">
                <div className="rounded-full bg-primary/10 p-4">
                  <Upload className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-medium">Click to upload or drag &amp; drop</p>
                  <p className="text-sm text-muted-foreground">Multiple files supported · max 50MB total</p>
                </div>
              </div>
            </div>
            {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Supports TPBank (legacy &amp; new), MB Bank, and generic STT-formatted Vietnamese statements.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (isAnalyzing) {
    return (
      <main className="min-h-screen bg-muted/20 p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-9 w-9" />
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-[500px]" />
          <p className="text-center text-sm text-muted-foreground">
            <RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />
            Parsing in your browser…
          </p>
        </div>
      </main>
    );
  }

  if (!result) return null;

  return (
    <main className="min-h-screen bg-muted/20 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Analysis Results</h1>
            <p className="text-muted-foreground">
              {result.transactions.length} transactions • {result.duplicates} duplicates in {result.groups.length} groups
              {result.diagnostics?.length ? ` • ${result.diagnostics.length} sheet(s)` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <Button variant="outline" size="sm" onClick={clearAll}>
              <RefreshCw className="mr-2 h-4 w-4" />
              New analysis
            </Button>
            <Button size="sm" onClick={downloadCSV}>
              <Download className="mr-2 h-4 w-4" />
              Download Clean CSV
            </Button>
          </div>
        </div>

        {/* Diagnostics */}
        {result.diagnostics?.length ? <DiagnosticsPanel diagnostics={result.diagnostics} /> : null}

        {/* Summary */}
        <div className="grid gap-4 md:grid-cols-4">
          <SummaryCard label="Total Transactions" value={result.total} icon={<FileText className="h-4 w-4" />} />
          <SummaryCard
            label="Duplicates"
            value={result.duplicates}
            sub={`${result.groups.length} groups`}
            icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
            tone="destructive"
          />
          <SummaryCard
            label="Total Credit"
            value={formatAmount(totals.credit)}
            icon={<CheckCircle className="h-4 w-4 text-green-600" />}
            tone="success"
          />
          <SummaryCard
            label="Total Debit"
            value={formatAmount(totals.debit)}
            sub={`Net ${totals.net >= 0 ? "+" : ""}${formatAmount(totals.net)}`}
            icon={<AlertCircle className="h-4 w-4" />}
          />
        </div>

        {/* Duplicate groups */}
        {result.groups.length > 0 && (
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Duplicate Groups
              <Badge variant="secondary" className="ml-2">{result.groups.length}</Badge>
            </h2>
            <div className="grid gap-3">
              {result.groups.map((group) => (
                <DuplicateGroupCard
                  key={group.id}
                  group={group}
                  txs={groupTxMap.get(group.id) ?? []}
                  keepId={keepIds[group.id]}
                  onKeepChange={(txId) => setKeepIds((prev) => ({ ...prev, [group.id]: txId }))}
                />
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-lg">All Transactions</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowFilters((v) => !v)}>
                <Filter className="mr-2 h-4 w-4" />
                {showFilters ? "Hide filters" : "Filters"}
                {(filters.search || filters.type !== "all" || filters.duplicatesOnly || filters.dateFrom || filters.dateTo || filters.minAmount || filters.maxAmount) && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">on</Badge>
                )}
              </Button>
            </div>
            {showFilters && (
              <div className="grid gap-3 pt-3 md:grid-cols-3 lg:grid-cols-6">
                <Input
                  placeholder="Search description / details / file…"
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  className="lg:col-span-2"
                />
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={filters.type}
                  onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as Filters["type"] }))}
                >
                  <option value="all">All types</option>
                  <option value="credit">Credit only</option>
                  <option value="debit">Debit only</option>
                </select>
                <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
                <Input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
                <Input
                  type="number"
                  placeholder="Min amount"
                  value={filters.minAmount}
                  onChange={(e) => setFilters((f) => ({ ...f, minAmount: e.target.value }))}
                />
                <Input
                  type="number"
                  placeholder="Max amount"
                  value={filters.maxAmount}
                  onChange={(e) => setFilters((f) => ({ ...f, maxAmount: e.target.value }))}
                  className="lg:col-span-1"
                />
                <label className="flex items-center gap-2 text-sm lg:col-span-2">
                  <Checkbox
                    checked={filters.duplicatesOnly}
                    onChange={(e) => setFilters((f) => ({ ...f, duplicatesOnly: e.target.checked }))}
                  />
                  Duplicates only
                </label>
                <Button variant="ghost" size="sm" onClick={() => setFilters(emptyFilters)} className="lg:col-span-2 lg:justify-self-end">
                  <X className="mr-2 h-4 w-4" />
                  Clear filters
                </Button>
              </div>
            )}
            <p className="pt-1 text-xs text-muted-foreground">
              Showing {visible.length.toLocaleString()} of {filtered.length.toLocaleString()} matching · {result.transactions.length.toLocaleString()} total
            </p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <SortHeader label="Date" active={sortKey === "date"} dir={sortDir} onClick={() => setSort("date")} />
                    <SortHeader label="Description" active={sortKey === "description"} dir={sortDir} onClick={() => setSort("description")} />
                    <TableHead>Details</TableHead>
                    <SortHeader label="Debit" align="right" active={sortKey === "amount"} dir={sortDir} onClick={() => setSort("amount")} />
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((tx) => (
                    <TableRow key={tx.id} className={cn(tx.isDuplicate && "bg-destructive/10 hover:bg-destructive/20")}>
                      <TableCell className="font-medium">{tx.date}</TableCell>
                      <TableCell className="max-w-[280px] truncate" title={tx.description}>
                        {tx.description}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground" title={tx.details}>
                        {tx.details || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {tx.type === "debit" ? formatAmount(tx.amount) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-green-700 dark:text-green-400">
                        {tx.type === "credit" ? formatAmount(tx.amount) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {tx.balance ? formatAmount(tx.balance) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{tx.sourceFile ?? "—"}</TableCell>
                      <TableCell>
                        {tx.isDuplicate && (
                          <Badge variant="destructive" className="text-[10px]">
                            Dup
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!visible.length && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                        No transactions match these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
            {visibleRows < filtered.length && (
              <div className="flex justify-center pt-4">
                <Button variant="outline" onClick={() => setVisibleRows((v) => v + PAGE_SIZE)}>
                  Show {Math.min(PAGE_SIZE, filtered.length - visibleRows)} more
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

// ================ SUB-COMPONENTS ================

function ThemeToggle({ theme, onToggle }: { theme: string; onToggle: () => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Toggle theme">
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  tone?: "destructive" | "success";
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "text-2xl font-bold",
            tone === "destructive" && "text-destructive",
            tone === "success" && "text-green-700 dark:text-green-400",
          )}
        >
          {value}
        </div>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function SortHeader({
  label,
  align = "left",
  active,
  dir,
  onClick,
}: {
  label: string;
  align?: "left" | "right";
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active && (dir === "asc" ? "rotate-180" : ""))} />
      </button>
    </TableHead>
  );
}

function DiagnosticsPanel({ diagnostics }: { diagnostics: ParseResult["diagnostics"] }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/40">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                Detected {diagnostics.length} sheet(s) — {diagnostics.map((d) => d.formatLabel.split(" — ")[0]).filter((v, i, a) => a.indexOf(v) === i).join(", ")}
              </span>
            </div>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 border-t p-4">
            {diagnostics.map((d, i) => (
              <div key={i} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{d.fileName}</Badge>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono text-xs">{d.sheetName}</span>
                  <Badge variant="secondary" className="text-[10px]">{d.formatLabel}</Badge>
                  <span className="text-xs text-muted-foreground">header at row {d.headerRow}</span>
                  <Badge variant={d.rowCount > 0 ? "success" : "destructive"} className="text-[10px]">
                    {d.rowCount} rows
                  </Badge>
                </div>
                {d.columnMap && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Column map: {Object.entries(d.columnMap).map(([k, v]) => `${k}=${v}`).join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function DuplicateGroupCard({
  group,
  txs,
  keepId,
  onKeepChange,
}: {
  group: DuplicateGroup;
  txs: Transaction[];
  keepId?: string;
  onKeepChange: (txId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Field label="Date" value={group.date} />
          <Separator orientation="vertical" className="h-8" />
          <Field label="Amount" value={formatAmount(group.amount)} />
          <Separator orientation="vertical" className="h-8" />
          <Field label="Count" value={String(group.count)} valueClass="text-destructive" />
          <Separator orientation="vertical" className="h-8" />
          <div className="min-w-[200px] flex-1">
            <div className="text-xs font-medium text-muted-foreground">Description</div>
            <div className="truncate text-sm font-medium" title={group.descriptions[0]}>
              {group.descriptions[0]}
            </div>
          </div>
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="mt-3 rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Keep</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txs.map((tx) => (
                <TableRow key={tx.id} className={cn(keepId === tx.id && "bg-green-50 dark:bg-green-950/20")}>
                  <TableCell>
                    <input
                      type="radio"
                      name={`keep-${group.id}`}
                      checked={keepId === tx.id}
                      onChange={() => onKeepChange(tx.id)}
                      className="h-4 w-4 cursor-pointer"
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{tx.sourceFile ?? "—"}</TableCell>
                  <TableCell>{tx.date}</TableCell>
                  <TableCell className="max-w-[300px] truncate" title={tx.description}>{tx.description}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground" title={tx.details}>{tx.details || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Field({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className={cn("font-bold", valueClass)}>{value}</span>
    </div>
  );
}
