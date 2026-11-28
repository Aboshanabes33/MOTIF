import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { ConvexReactClient, ConvexProviderWithAuth, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { PLANS, type PlanId } from "./plans";

const workosClientId = import.meta.env.VITE_WORKOS_CLIENT_ID as string | undefined;
const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
// Auth is off (the app opens as before) unless both values are set at build time.
export const isAuthConfigured = Boolean(workosClientId && convexUrl);

const meRef = makeFunctionReference<"query", Record<string, never>, { plan: PlanId | null; planStatus: string | null } | null>("users:me");
const storeRef = makeFunctionReference<"mutation", Record<string, never>, unknown>("users:store");
const choosePlanRef = makeFunctionReference<"mutation", { plan: PlanId }, null>("users:choosePlan");

function useAuthFromAuthKit() {
  const { isLoading, user, getAccessToken } = useAuth();
  const fetchAccessToken = useCallback(async () => {
    try { return (await getAccessToken()) ?? null; } catch { return null; }
  }, [getAccessToken]);
  return useMemo(() => ({ isLoading, isAuthenticated: Boolean(user), fetchAccessToken }), [isLoading, user, fetchAccessToken]);
}

const T = {
  en: {
    welcome: "Welcome to MOTIF",
    signInText: "Sign in or create an account to continue.",
    signIn: "Sign in",
    signUp: "Create account",
    chooseTitle: "Choose your plan",
    chooseText: "Pick how you want to use MOTIF. You can change this later.",
    soon: "Coming soon",
    free: "Free",
    freeDesc: "Connect your accounts and agents.",
    monthly: "Monthly",
    yearly: "Yearly",
    paidDesc: "Templates and styles.",
    trial: "{n}-day free trial",
    perMonth: "SAR / month",
    perYear: "SAR / year",
    choose: "Choose",
    soonNote: "Paid plans are coming soon (payments via Whop sandbox). Your choice is saved and you stay on Free until they open.",
    signOut: "Sign out",
    loading: "Loading…",
  },
  ar: {
    welcome: "مرحباً بك في MOTIF",
    signInText: "سجّل الدخول أو أنشئ حساباً للمتابعة.",
    signIn: "تسجيل الدخول",
    signUp: "إنشاء حساب",
    chooseTitle: "اختر باقتك",
    chooseText: "اختر كيف تريد استخدام MOTIF. يمكنك تغييرها لاحقاً.",
    soon: "قريباً",
    free: "مجانية",
    freeDesc: "اربط حساباتك ووكلاءك فقط.",
    monthly: "شهرية",
    yearly: "سنوية",
    paidDesc: "قوالب وستايلات.",
    trial: "تجربة مجانية {n} أيام",
    perMonth: "ريال / شهر",
    perYear: "ريال / سنة",
    choose: "اختيار",
    soonNote: "الباقات المدفوعة قريباً (الدفع عبر Whop sandbox). يُحفظ اختيارك وتبقى على المجانية حتى تُفتح.",
    signOut: "تسجيل الخروج",
    loading: "جارٍ التحميل…",
  },
} as const;

function Shell({ lang, children }: { lang: "en" | "ar"; children: ReactNode }) {
  return (
    <div className="onboarding-backdrop" dir={lang === "ar" ? "rtl" : "ltr"}>
      <section className="onboarding-card glass" style={{ maxWidth: 760 }}>{children}</section>
    </div>
  );
}

function SignedIn({ lang, children }: { lang: "en" | "ar"; children: ReactNode }) {
  const t = T[lang];
  const { signOut } = useAuth();
  const me = useQuery(meRef, {});
  const store = useMutation(storeRef);
  const choosePlan = useMutation(choosePlanRef);
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { store({}).catch(() => {}); }, [store]);

  if (me === undefined) return <Shell lang={lang}><p>{t.loading}</p></Shell>;
  if (me?.plan) return <>{children}</>;

  const pick = async (plan: PlanId) => {
    setBusy(plan);
    setError("");
    try { await choosePlan({ plan }); } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
    setBusy(null);
  };

  return (
    <Shell lang={lang}>
      <h2>{t.chooseTitle}</h2>
      <p>{t.chooseText}</p>
      <div className="onboarding-options">
        {PLANS.map((plan) => (
          <button key={plan.id} disabled={busy !== null} onClick={() => pick(plan.id)}>
            <span>
              {plan.id === "free" ? t.free : plan.id === "monthly" ? t.monthly : t.yearly}
              {plan.comingSoon && <> · <em>{t.soon}</em></>}
            </span>
            <small>
              {plan.id === "free" ? t.freeDesc : `${plan.priceSar} ${plan.id === "monthly" ? t.perMonth : t.perYear} · ${t.trial.replace("{n}", String(plan.trialDays))} · ${t.paidDesc}`}
            </small>
          </button>
        ))}
      </div>
      <small>{t.soonNote}</small>
      {error && <small role="alert">{error}</small>}
      <button className="onboarding-skip" onClick={() => signOut()}>{t.signOut}</button>
    </Shell>
  );
}

function Gate({ lang, children }: { lang: "en" | "ar"; children: ReactNode }) {
  const t = T[lang];
  const { isLoading, user, signIn, signUp } = useAuth();
  if (isLoading) return <Shell lang={lang}><p>{t.loading}</p></Shell>;
  if (!user) {
    return (
      <Shell lang={lang}>
        <h2>{t.welcome}</h2>
        <p>{t.signInText}</p>
        <button className="btn btn--primary onboarding-submit" onClick={() => signIn()}>{t.signIn}</button>
        <button className="onboarding-skip" onClick={() => signUp()}>{t.signUp}</button>
      </Shell>
    );
  }
  return <SignedIn lang={lang}>{children}</SignedIn>;
}

let convexClient: ConvexReactClient | null = null;

export function AuthGate({ children }: { children: ReactNode }) {
  if (!isAuthConfigured) return <>{children}</>;
  convexClient ||= new ConvexReactClient(convexUrl as string);
  let lang: "en" | "ar" = "en";
  try { lang = localStorage.getItem("motif.lang") === "ar" ? "ar" : "en"; } catch { /* default */ }
  return (
    <AuthKitProvider clientId={workosClientId as string}>
      <ConvexProviderWithAuth client={convexClient} useAuth={useAuthFromAuthKit}>
        <Gate lang={lang}>{children}</Gate>
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}
