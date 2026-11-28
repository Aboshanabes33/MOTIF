export type PlanId = "free" | "monthly" | "yearly";

export interface PlanDef {
  id: PlanId;
  priceSar: number;
  trialDays: number;
  comingSoon: boolean;
}

// Prices in SAR as requested by the owner. Paid plans are "coming soon" (payment via Whop sandbox later).
export const PLANS: PlanDef[] = [
  { id: "free", priceSar: 0, trialDays: 0, comingSoon: false },
  { id: "monthly", priceSar: 25, trialDays: 7, comingSoon: true },
  { id: "yearly", priceSar: 50, trialDays: 7, comingSoon: true },
];
