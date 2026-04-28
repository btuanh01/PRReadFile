/// <reference lib="webworker" />
import { parseExcelFiles, type ParseInput } from "./parser";

interface WorkerRequest {
  files: ParseInput[];
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    const result = parseExcelFiles(e.data.files);
    (self as unknown as Worker).postMessage({ ok: true, result });
  } catch (err: any) {
    (self as unknown as Worker).postMessage({ ok: false, error: err?.message || String(err) });
  }
};

export {};
