// The pure bill parsers now live in _shared/bill.ts so the analyzer SCREEN, the
// in-chat photo path (site-ai-chat), and any future surface share ONE
// implementation (mirrors the leadlookup extraction). This module re-exports them
// unchanged so site-bill-analyzer/index.ts and the existing unit tests keep
// importing them from "./lib.ts". No behaviour change — just a moved home.

export {
  buildParsedBill,
  type Extracted,
  parseExtraction,
  parseImage,
  parseLines,
} from "../_shared/bill.ts";
