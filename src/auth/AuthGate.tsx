import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { ConvexReactClient, ConvexProviderWithAuth, useAction, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { PLANS, type PlanId } from "./plans";

const workosClientId = import.meta.env.VITE_WORKOS_CLIENT_ID as string | undefined;
const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
// Auth is off (the app opens as before) unless both values are set at build time.
export const isAuthConfigured = Boolean(workosClientId && convexUrl);

const meRef = makeFunctionReference<"query", Record<string, never>, { plan: PlanId | null; planStatus: string | null } | null>("users:me");
const storeRef = makeFunctionReference<"mutation", Record<string, never>, unknown>("users:store");
const deleteAccountRef = makeFunctionReference<"action", Record<string, never>, { workosDeleted: boolean }>("users:deleteAccount");
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
    billedYearly: "billed yearly ({total} SAR / year)",
    sandbox: "Whop sandbox",
    trial: "{n}-day free trial",
    perMonth: "SAR / month",
    perYear: "SAR / month",
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
    billedYearly: "تُدفع سنوياً ({total} ريال / سنة)",
    sandbox: "Whop sandbox",
    trial: "تجربة مجانية {n} أيام",
    perMonth: "ريال / شهر",
    perYear: "ريال / شهر",
    choose: "اختيار",
    soonNote: "الباقات المدفوعة قريباً (الدفع عبر Whop sandbox). يُحفظ اختيارك وتبقى على المجانية حتى تُفتح.",
    signOut: "تسجيل الخروج",
    loading: "جارٍ التحميل…",
  },
} as const;

function planLabel(t: (typeof T)["en"] | (typeof T)["ar"], id: PlanId): string {
  return id === "free" ? t.free : id === "monthly" ? t.monthly : t.yearly;
}

function planDetail(t: (typeof T)["en"] | (typeof T)["ar"], plan: (typeof PLANS)[number]): string {
  if (plan.id === "free") return t.freeDesc;
  const price = `${plan.priceSar} ${plan.billedYearly ? t.perYear : t.perMonth}`;
  const billed = plan.billedYearly ? ` (${t.billedYearly.replace("{total}", String(plan.priceSar * 12))})` : "";
  return `${price}${billed} · ${t.trial.replace("{n}", String(plan.trialDays))} · ${t.paidDesc}`;
}

// Opens the Whop sandbox checkout for a paid plan when its link is configured. Payment stays on Whop.
function openCheckout(plan: PlanId) {
  const def = PLANS.find((p) => p.id === plan);
  if (!def?.checkoutUrl) return;
  if (window.motifDesktop?.openExternal) window.motifDesktop.openExternal(def.checkoutUrl).catch(() => {});
  else window.open(def.checkoutUrl, "_blank", "noopener");
}

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
    try {
      await choosePlan({ plan });
      openCheckout(plan);
    } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
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
              {planLabel(t, plan.id)}
              {plan.comingSoon ? <> · <em>{t.soon}</em></> : plan.id !== "free" && <> · <em>{t.sandbox}</em></>}
            </span>
            <small>
              {planDetail(t, plan)}
            </small>
          </button>
        ))}
      </div>
      {PLANS.some((plan) => plan.comingSoon) && <small>{t.soonNote}</small>}
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
    <AuthKitProvider clientId={workosClientId as string} redirectUri={`${window.location.origin}/`}>
      <ConvexProviderWithAuth client={convexClient} useAuth={useAuthFromAuthKit}>
        <Gate lang={lang}>{children}</Gate>
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}

const A = {
  en: {
    title: "Account",
    signedAs: "Signed in as",
    plan: "Plan",
    change: "Change plan",
    current: "Current",
    signOut: "Sign out",
    danger: "Delete account",
    dangerText: "This permanently deletes your MOTIF account and sign-in. Local files on this computer are not touched. Type DELETE to confirm.",
    confirmWord: "DELETE",
    deleteBtn: "Delete my account",
    deleted: "Account deleted",
    off: "Sign-in is not enabled in this build.",
    soon: "Coming soon",
  },
  ar: {
    title: "الحساب",
    signedAs: "مسجّل الدخول باسم",
    plan: "الباقة",
    change: "تغيير الباقة",
    current: "الحالية",
    signOut: "تسجيل الخروج",
    danger: "حذف الحساب",
    dangerText: "يحذف حسابك في MOTIF وتسجيل دخولك نهائياً. ملفاتك على هذا الجهاز لا تتأثر. اكتب DELETE للتأكيد.",
    confirmWord: "DELETE",
    deleteBtn: "احذف حسابي",
    deleted: "تم حذف الحساب",
    off: "تسجيل الدخول غير مفعّل في هذا الإصدار.",
    soon: "قريباً",
  },
} as const;

function AccountPaneInner({ lang, onToast }: { lang: "en" | "ar"; onToast: (m: string) => void }) {
  const a = A[lang];
  const t = T[lang];
  const { user, signOut } = useAuth();
  const me = useQuery(meRef, {});
  const choosePlan = useMutation(choosePlanRef);
  const deleteAccount = useAction(deleteAccountRef);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const change = async (plan: PlanId) => {
    setError("");
    try { await choosePlan({ plan }); openCheckout(plan); } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
  };
  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await deleteAccount({});
      onToast(a.deleted);
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="settings-intro"><h3>{a.title}</h3><p>{a.signedAs} {user?.email || ""}{user?.firstName ? ` (${user.firstName}${user.lastName ? ` ${user.lastName}` : ""})` : ""}</p></div>
      <div className="onboarding-options">
        {PLANS.map((plan) => (
          <button key={plan.id} disabled={me?.plan === plan.id} onClick={() => change(plan.id)}>
            <span>{planLabel(t, plan.id)}{me?.plan === plan.id ? ` · ${a.current}` : plan.comingSoon ? ` · ${a.soon}` : ""}</span>
            <small>{planDetail(t, plan)}</small>
          </button>
        ))}
      </div>
      <button className="btn" onClick={() => signOut()}>{a.signOut}</button>
      <div className="settings-version-card" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        <strong>{a.danger}</strong>
        <small>{a.dangerText}</small>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={a.confirmWord} aria-label={a.danger} />
        <button className="btn" disabled={busy || confirm !== a.confirmWord} onClick={remove}>{a.deleteBtn}</button>
        {error && <small role="alert">{error}</small>}
      </div>
    </section>
  );
}

// Rendered inside Settings. Only meaningful (and only mounted inside the providers) when auth is configured.
export function AccountPane({ lang, onToast }: { lang: "en" | "ar"; onToast: (m: string) => void }) {
  if (!isAuthConfigured) return <section><div className="settings-intro"><h3>{A[lang].title}</h3><p>{A[lang].off}</p></div></section>;
  return <AccountPaneInner lang={lang} onToast={onToast} />;
}
