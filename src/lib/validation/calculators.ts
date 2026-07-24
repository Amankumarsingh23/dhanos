import { z } from "zod";
import { uuidSchema } from "@/lib/validation/primitives";

/**
 * Shared zod schemas for the financial-calculators feature (PROMPT 20,
 * src/features/calculators). Each calculator's own live inputs are
 * validated ad hoc in its component (see
 * src/lib/calculations/calculators/rate-validation.ts and
 * src/lib/money's parseDecimalToMinorUnits) since a calculator recomputes
 * on every keystroke rather than on a single form submit — the only
 * server-validated write here is explicitly saving a scenario snapshot
 * (PROMPT 20: "Do not save a scenario unless user explicitly chooses
 * Save").
 */

export const CALCULATOR_TYPES = [
  "sip_projection",
  "lump_sum",
  "daily_growth",
  "emi",
  "loan_prepayment",
  "goal_funding",
] as const;
export const calculatorTypeSchema = z.enum(CALCULATOR_TYPES);
export type CalculatorType = z.infer<typeof calculatorTypeSchema>;

export const CALCULATOR_TYPE_LABELS: Record<CalculatorType, string> = {
  sip_projection: "SIP projection",
  lump_sum: "Lump sum",
  daily_growth: "Daily growth",
  emi: "EMI",
  loan_prepayment: "Loan prepayment",
  goal_funding: "Goal funding",
};

/**
 * A saved scenario is a frozen snapshot: both the inputs that produced it
 * and the outputs it showed at save time, so reopening it later never
 * silently reflects a formula change made after the fact — it shows
 * exactly what the household saw and decided to keep.
 */
export const saveCalculatorScenarioSchema = z.object({
  calculatorType: calculatorTypeSchema,
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(200, "Name is too long"),
  inputs: z.record(z.string(), z.unknown()),
  outputs: z.record(z.string(), z.unknown()),
  linkedAccountId: uuidSchema.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type SaveCalculatorScenarioInput = z.input<
  typeof saveCalculatorScenarioSchema
>;

export const deleteCalculatorScenarioSchema = z.object({
  scenarioId: uuidSchema,
});
export type DeleteCalculatorScenarioInput = z.input<
  typeof deleteCalculatorScenarioSchema
>;
