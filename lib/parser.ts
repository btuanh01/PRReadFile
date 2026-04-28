import * as XLSX from "xlsx";

export interface Transaction {
  id: string;
  serial: string;
  date: string;
  description: string;
  details?: string;
  amount: number;
  type: "credit" | "debit";
  balance: number;
  originalLine: string;
  isDuplicate: boolean;
  duplicateGroupId?: string;
  sourceFile?: string;
}

export interface DuplicateGroup {
  id: string;
  count: number;
  amount: number;
  date: string;
  descriptions: string[];
  transactionIds: string[];
}

interface SheetDiagnostic {
  fileName: string;
  sheetName: string;
  format: number;
  formatLabel: string;
  headerRow: number;
  rowCount: number;
  columnMap?: Record<string, number>;
}

export interface ParseResult {
  total: number;
  duplicates: number;
  groups: DuplicateGroup[];
  transactions: Transaction[];
  diagnostics: SheetDiagnostic[];
}

const FORMAT_LABELS: Record<number, string> = {
  1: "Format 1 — STT/Date/Description/Debit/Credit/Balance (8 cols)",
  2: "Format 2 — Date/Description/Details/Debit/Credit/Balance (6 cols)",
  3: "Format 3 — TPBank (new) — 9 cols incl. Tài khoản đối ứng",
  4: "Format 4 — MB Bank (Quân Đội)",
};

function cleanAmount(str: any): number {
  if (typeof str === "number") return str;
  const strVal = String(str ?? "").trim();
  if (!strVal) return 0;
  const lastDot = strVal.lastIndexOf(".");
  const lastComma = strVal.lastIndexOf(",");
  let cleaned = strVal;
  if (lastComma > lastDot) {
    cleaned = strVal.replace(/\./g, "").replace(",", ".");
  } else {
    cleaned = strVal.replace(/,/g, "");
  }
  return parseFloat(cleaned) || 0;
}

function stripDiacriticsUpper(s: any): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function parseDateString(rawDate: any): string {
  if (typeof rawDate === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + rawDate * 86400000);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
  let s = String(rawDate ?? "").trim().replace(/-/g, "/");
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const day = m[1].padStart(2, "0");
    const month = m[2].padStart(2, "0");
    const year = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${day}/${month}/${year}`;
  }
  return s;
}

function buildMBColumnMap(row1: any[], row2: any[]): Record<string, number> {
  const m: Record<string, number> = {};
  const maxCols = Math.max(row1?.length || 0, row2?.length || 0);
  for (let c = 0; c < maxCols; c++) {
    const v1 = stripDiacriticsUpper(row1?.[c]);
    const v2 = stripDiacriticsUpper(row2?.[c]);
    const combined = `${v1} ${v2}`.trim();
    if (!combined) continue;
    if (m.stt === undefined && (combined === "STT" || combined.startsWith("STT ") || combined === "NO" || combined === "NO."))
      m.stt = c;
    else if (m.date === undefined && (combined.includes("NGAY GIAO DICH") || combined.includes("TRANSACTION DATE")))
      m.date = c;
    else if (m.txNo === undefined && (combined.includes("SO BUT TOAN") || combined.includes("TRANSACTION NO")))
      m.txNo = c;
    else if (m.debit === undefined && combined.includes("PHAT SINH NO")) m.debit = c;
    else if (m.credit === undefined && combined.includes("PHAT SINH CO")) m.credit = c;
    else if (m.details === undefined && (combined.includes("NOI DUNG") || combined === "DETAILS" || combined.startsWith("DETAILS ")))
      m.details = c;
    else if (m.beneficiary === undefined && (combined.includes("THU HUONG") || combined.includes("BENEFICIARY")))
      m.beneficiary = c;
    else if (m.account === undefined && (combined === "TAI KHOAN" || combined.startsWith("TAI KHOAN ") || combined === "ACCOUNT" || combined.startsWith("ACCOUNT ")))
      m.account = c;
    else if (m.bank === undefined && (combined.includes("NGAN HANG") || combined.includes("REMITTER"))) m.bank = c;
  }
  return m;
}

function newId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function detectFormat(data: any[][]): {
  excelFormat: number;
  headerRowIndex: number;
  format4Cols: Record<string, number> | null;
} {
  let headerRowIndex = 0;
  let excelFormat = 1;
  let format4Cols: Record<string, number> | null = null;

  for (let i = 0; i < Math.min(30, data.length); i++) {
    const row: any[] = data[i] || [];
    const nextRow: any[] = data[i + 1] || [];
    const firstCol = stripDiacriticsUpper(row[0]);
    const secondCol = stripDiacriticsUpper(row[1]);
    const thirdCol = stripDiacriticsUpper(row[2]);
    const rowJoined = row.map((c) => stripDiacriticsUpper(c)).join(" | ");
    const nextRowJoined = nextRow.map((c) => stripDiacriticsUpper(c)).join(" | ");

    // Format 4 (MB Bank): scan-based — STT + Phát sinh nợ/có anywhere
    if (
      (rowJoined.includes("PHAT SINH NO") || nextRowJoined.includes("PHAT SINH NO")) &&
      (rowJoined.includes("STT") || nextRowJoined.includes("STT") ||
        rowJoined.includes("NGAY GIAO DICH") || nextRowJoined.includes("NGAY GIAO DICH"))
    ) {
      const cols = buildMBColumnMap(row, nextRow);
      if (cols.stt !== undefined && cols.date !== undefined && cols.debit !== undefined && cols.credit !== undefined) {
        format4Cols = cols;
        excelFormat = 4;
        headerRowIndex = i;
        if (nextRowJoined.includes("TRANSACTION DATE") || nextRowJoined.includes("DEBIT") || nextRowJoined.includes("CREDIT")) {
          headerRowIndex = i + 1;
        }
        return { excelFormat, headerRowIndex, format4Cols };
      }
    }

    if (firstCol === "STT" || firstCol.startsWith("STT ") || firstCol === "NO" || firstCol === "NO.") {
      return { excelFormat: 1, headerRowIndex: i, format4Cols: null };
    }

    if (firstCol.includes("NGAY") && secondCol.includes("NGAY") && thirdCol.includes("MO TA")) {
      return { excelFormat: 3, headerRowIndex: i, format4Cols: null };
    }

    if (firstCol.includes("NGAY") || firstCol === "DATE") {
      return { excelFormat: 2, headerRowIndex: i, format4Cols: null };
    }
  }

  return { excelFormat, headerRowIndex, format4Cols };
}

function pushTx(
  out: Transaction[],
  t: Omit<Transaction, "id" | "isDuplicate">,
): void {
  out.push({ ...t, id: newId(), isDuplicate: false });
}

function parseSheet(
  fileName: string,
  sheetName: string,
  data: any[][],
  out: Transaction[],
): SheetDiagnostic {
  const { excelFormat, headerRowIndex, format4Cols } = detectFormat(data);
  const startCount = out.length;

  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row: any = data[i];
    if (!row || row.length === 0) continue;
    if (excelFormat === 4 && format4Cols) {
      if (!row[format4Cols.stt!]) continue;
    } else if (!row[0]) continue;

    let dateStr = "";
    let description = "";
    let serial = "";
    let debitVal = 0;
    let creditVal = 0;
    let balanceVal = 0;
    let details: string | undefined;

    if (excelFormat === 3) {
      if (row.length < 6) continue;
      dateStr = parseDateString(row[0]);
      if (!/\d{2}\/\d{2}\/\d{4}/.test(dateStr)) continue;
      description = String(row[2] ?? "").trim();
      const counterAccount = String(row[6] ?? "").trim();
      const accountName = String(row[7] ?? "").trim();
      const txCode = String(row[8] ?? "").trim();
      debitVal = typeof row[3] === "number" ? row[3] : cleanAmount(row[3]);
      creditVal = typeof row[4] === "number" ? row[4] : cleanAmount(row[4]);
      balanceVal = typeof row[5] === "number" ? row[5] : cleanAmount(row[5]);
      details = [accountName, counterAccount, txCode].filter(Boolean).join(" | ") || undefined;
      serial = String(i - headerRowIndex);
    } else if (excelFormat === 4 && format4Cols) {
      const c = format4Cols;
      serial = String(row[c.stt!] ?? "").trim();
      if (!serial || !/^\d+$/.test(serial)) continue;
      dateStr = parseDateString(row[c.date!]);
      if (!/\d{2}\/\d{2}\/\d{4}/.test(dateStr)) continue;
      const txNo = c.txNo !== undefined ? String(row[c.txNo] ?? "").trim() : "";
      description = String(row[c.details!] ?? "").trim();
      const beneficiary = c.beneficiary !== undefined ? String(row[c.beneficiary] ?? "").trim() : "";
      const account = c.account !== undefined ? String(row[c.account] ?? "").trim() : "";
      const partnerBank = c.bank !== undefined ? String(row[c.bank] ?? "").trim() : "";
      debitVal = typeof row[c.debit!] === "number" ? row[c.debit!] : cleanAmount(row[c.debit!]);
      creditVal = typeof row[c.credit!] === "number" ? row[c.credit!] : cleanAmount(row[c.credit!]);
      balanceVal = 0;
      details = [beneficiary, account, partnerBank, txNo].filter(Boolean).join(" | ") || undefined;
    } else if (excelFormat === 2) {
      if (row.length < 6) continue;
      dateStr = parseDateString(row[0]);
      if (!/\d{2}\/\d{2}\/\d{4}/.test(dateStr)) continue;
      description = String(row[1] ?? "").trim();
      details = String(row[2] ?? "").trim() || undefined;
      debitVal = typeof row[3] === "number" ? row[3] : cleanAmount(row[3]);
      creditVal = typeof row[4] === "number" ? row[4] : cleanAmount(row[4]);
      balanceVal = typeof row[5] === "number" ? row[5] : cleanAmount(row[5]);
      serial = String(i - headerRowIndex);
    } else {
      // Format 1
      if (row.length < 8) continue;
      serial = String(row[0] ?? "").trim();
      if (!serial || !/^\d+$/.test(serial)) continue;
      dateStr = parseDateString(row[1]);
      if (!/\d{2}\/\d{2}\/\d{4}/.test(dateStr)) continue;
      description = String(row[4] ?? "").trim();
      debitVal = typeof row[5] === "number" ? row[5] : cleanAmount(row[5]);
      creditVal = typeof row[6] === "number" ? row[6] : cleanAmount(row[6]);
      balanceVal = typeof row[7] === "number" ? row[7] : cleanAmount(row[7]);
    }

    let amount = 0;
    let type: "credit" | "debit" = "credit";
    if (creditVal !== 0 && !isNaN(creditVal)) {
      amount = creditVal;
      type = "credit";
    } else if (debitVal !== 0 && !isNaN(debitVal)) {
      amount = debitVal;
      type = "debit";
    } else {
      continue;
    }

    pushTx(out, {
      serial,
      date: dateStr,
      description,
      details,
      amount,
      type,
      balance: balanceVal,
      originalLine: row.join(" | "),
      sourceFile: fileName,
    });
  }

  return {
    fileName,
    sheetName,
    format: excelFormat,
    formatLabel: FORMAT_LABELS[excelFormat] || `Format ${excelFormat}`,
    headerRow: headerRowIndex + 1, // 1-indexed for display
    rowCount: out.length - startCount,
    columnMap: format4Cols || undefined,
  };
}

export interface ParseInput {
  fileName: string;
  buffer: ArrayBuffer | Uint8Array;
}

export function parseExcelFiles(files: ParseInput[]): ParseResult {
  const transactions: Transaction[] = [];
  const diagnostics: SheetDiagnostic[] = [];

  for (const f of files) {
    const workbook = XLSX.read(f.buffer, { type: "array" });
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
      const diag = parseSheet(f.fileName, sheetName, data, transactions);
      diagnostics.push(diag);
    }
  }

  return detectDuplicates(transactions, diagnostics);
}

function detectDuplicates(transactions: Transaction[], diagnostics: SheetDiagnostic[] = []): ParseResult {
  const groups: Record<string, Transaction[]> = {};
  // reset duplicate flags (re-running on cached data)
  transactions.forEach((tx) => {
    tx.isDuplicate = false;
    tx.duplicateGroupId = undefined;
  });

  transactions.forEach((tx) => {
    const normalizedDesc = tx.description.trim().toUpperCase();
    const key = `${normalizedDesc}|${tx.amount.toFixed(2)}|${tx.type}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  });

  const resultGroups: DuplicateGroup[] = [];
  let duplicateCount = 0;

  Object.values(groups).forEach((group) => {
    if (group.length > 1) {
      const groupId = newId();
      group.forEach((tx) => {
        tx.isDuplicate = true;
        tx.duplicateGroupId = groupId;
      });
      resultGroups.push({
        id: groupId,
        count: group.length,
        amount: group[0].amount,
        date: group[0].date,
        descriptions: Array.from(new Set(group.map((g) => g.description))),
        transactionIds: group.map((g) => g.id),
      });
      duplicateCount += group.length;
    }
  });

  return {
    total: transactions.length,
    duplicates: duplicateCount,
    groups: resultGroups,
    transactions,
    diagnostics,
  };
}

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
