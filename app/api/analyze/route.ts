import { NextRequest, NextResponse } from "next/server";
import { parseExcelFiles, MAX_FILE_SIZE, type ParseInput } from "@/lib/parser";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("file") as File[];

    if (!files.length) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const inputs: ParseInput[] = [];
    let totalSize = 0;
    for (const file of files) {
      if (!file) continue;
      totalSize += file.size;
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)}MB — over the ${MAX_FILE_SIZE / 1024 / 1024}MB limit.` },
          { status: 413 },
        );
      }
      const arrayBuffer = await file.arrayBuffer();
      inputs.push({ fileName: file.name, buffer: arrayBuffer });
    }

    if (totalSize > MAX_FILE_SIZE * 2) {
      return NextResponse.json(
        { error: `Total upload is ${(totalSize / 1024 / 1024).toFixed(1)}MB — too large.` },
        { status: 413 },
      );
    }

    const result = parseExcelFiles(inputs);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error processing file:", error);
    return NextResponse.json(
      {
        error: error?.message || "Failed to process file",
        details: error?.stack || String(error),
      },
      { status: 500 },
    );
  }
}
