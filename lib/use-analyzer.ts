"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ParseInput, ParseResult } from "./parser";

interface AnalyzerState {
  result: ParseResult | null;
  isAnalyzing: boolean;
  error: string | null;
}

export function useAnalyzer() {
  const [state, setState] = useState<AnalyzerState>({ result: null, isAnalyzing: false, error: null });
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      workerRef.current = new Worker(new URL("./parser.worker.ts", import.meta.url), { type: "module" });
    } catch {
      workerRef.current = null;
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const analyze = useCallback(async (files: File[]) => {
    setState({ result: null, isAnalyzing: true, error: null });
    try {
      const inputs: ParseInput[] = await Promise.all(
        files.map(async (f) => ({ fileName: f.name, buffer: await f.arrayBuffer() })),
      );

      if (workerRef.current) {
        const result = await new Promise<ParseResult>((resolve, reject) => {
          const w = workerRef.current!;
          const onMessage = (e: MessageEvent) => {
            w.removeEventListener("message", onMessage);
            if (e.data?.ok) resolve(e.data.result);
            else reject(new Error(e.data?.error || "Worker failed"));
          };
          w.addEventListener("message", onMessage);
          w.postMessage({ files: inputs });
        });
        setState({ result, isAnalyzing: false, error: null });
        return result;
      }

      // Fallback: server-side via /api/analyze
      const fd = new FormData();
      files.forEach((f) => fd.append("file", f));
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      const result: ParseResult = await res.json();
      setState({ result, isAnalyzing: false, error: null });
      return result;
    } catch (e: any) {
      const msg = e?.message || "Analysis failed";
      setState({ result: null, isAnalyzing: false, error: msg });
      throw e;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ result: null, isAnalyzing: false, error: null });
  }, []);

  const setResult = useCallback((result: ParseResult | null) => {
    setState({ result, isAnalyzing: false, error: null });
  }, []);

  return { ...state, analyze, reset, setResult };
}
