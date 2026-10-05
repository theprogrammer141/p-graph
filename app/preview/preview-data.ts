import type { ParseResult } from "@/parser/types";
import rawData from "./preview-data.json";

export const previewData = rawData as unknown as ParseResult;
