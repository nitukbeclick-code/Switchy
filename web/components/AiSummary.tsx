// ────────────────────────────────────────────────────────────────────────────
// <AiSummary> — BACK-COMPAT ALIAS. The component was renamed to <SgeSummary>
// (see SgeSummary.tsx). This file re-exports it under the old name + types so
// existing imports (`import AiSummary from "@/components/AiSummary"`,
// `import { AiSummaryProps } from ...`) keep working unchanged.
//
// Prefer importing from "@/components/SgeSummary" in new code.
// ────────────────────────────────────────────────────────────────────────────

import SgeSummary, { type SgeSummaryProps } from "./SgeSummary";

/** @deprecated Use SgeSummaryProps from "@/components/SgeSummary". */
export type AiSummaryProps = SgeSummaryProps;

/** @deprecated Use <SgeSummary> from "@/components/SgeSummary". */
const AiSummary = SgeSummary;

export { SgeSummary };
export default AiSummary;
