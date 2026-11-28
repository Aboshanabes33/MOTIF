export type PlanId = "free" | "monthly" | "yearly";

export interface PlanDef {
  id: PlanId;
  /** Price per month in SAR. The yearly plan is billed once a year (priceSar x 12). */
  priceSar: number;
  billedYearly: boolean;
  trialDays: number;
  /** Whop sandbox checkout link for this plan (set at build time). Without it the plan stays "coming soon". */
  checkoutUrl: string;
  comingSoon: boolean;
}

const env = import.meta.env as Record<string, string | undefined>;
const monthlyUrl = env.VITE_WHOP_CHECKOUT_MONTHLY || "";
const yearlyUrl = env.VITE_WHOP_CHECKOUT_YEARLY || "";

export const PLANS: PlanDef[] = [
  { id: "free", priceSar: 0, billedYearly: false, trialDays: 0, checkoutUrl: "", comingSoon: false },
  { id: "monthly", priceSar: 25, billedYearly: false, trialDays: 7, checkoutUrl: monthlyUrl, comingSoon: !monthlyUrl },
  { id: "yearly", priceSar: 50, billedYearly: true, trialDays: 7, checkoutUrl: yearlyUrl, comingSoon: !yearlyUrl },
];
