import { actionGeneric, internalMutationGeneric, makeFunctionReference, mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

async function findUser(ctx: any, tokenIdentifier: string) {
  return ctx.db.query("users").withIndex("by_token", (q: any) => q.eq("tokenIdentifier", tokenIdentifier)).unique();
}

export const me = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await findUser(ctx, identity.tokenIdentifier);
    return user ? { plan: user.plan ?? null, planStatus: user.planStatus ?? null } : { plan: null, planStatus: null };
  },
});

// Creates the user row on first sign-in. Stores only the WorkOS id, email and name.
export const store = mutationGeneric({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in");
    const existing = await findUser(ctx, identity.tokenIdentifier);
    if (existing) return existing._id;
    return ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      workosUserId: identity.subject,
      email: identity.email,
      name: identity.name,
    });
  },
});

export const choosePlan = mutationGeneric({
  args: { plan: v.union(v.literal("free"), v.literal("monthly"), v.literal("yearly")) },
  handler: async (ctx, { plan }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in");
    const user = await findUser(ctx, identity.tokenIdentifier);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(user._id, {
      plan,
      // Paid plans are coming soon: record the choice, do not charge, keep free access.
      planStatus: plan === "free" ? "active" : "coming_soon",
      planChosenAt: Date.now(),
    });
  },
});

// Removes the signed-in user's row.
export const removeMe = mutationGeneric({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in");
    const user = await findUser(ctx, identity.tokenIdentifier);
    if (user) await ctx.db.delete(user._id);
  },
});

const removeMeRef = makeFunctionReference<"mutation", Record<string, never>, null>("users:removeMe");

// Deletes the account: our user row, then the WorkOS user when WORKOS_API_KEY is set in the Convex env.
export const deleteAccount = actionGeneric({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in");
    await ctx.runMutation(removeMeRef, {});
    const key = process.env.WORKOS_API_KEY;
    let workosDeleted = false;
    if (key) {
      const res = await fetch(`https://api.workos.com/user_management/users/${encodeURIComponent(identity.subject)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${key}` },
      });
      workosDeleted = res.ok;
    }
    return { workosDeleted };
  },
});

// Called by the Whop webhook (convex/http.ts). Matches the user by email.
export const applyWhop = internalMutationGeneric({
  args: { email: v.string(), plan: v.union(v.literal("free"), v.literal("monthly"), v.literal("yearly")), active: v.boolean() },
  handler: async (ctx, { email, plan, active }) => {
    const users = await ctx.db.query("users").collect();
    const user = users.find((u: any) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (!user) return false;
    await ctx.db.patch(user._id, active ? { plan, planStatus: "active", planChosenAt: Date.now() } : { plan: "free", planStatus: "inactive", planChosenAt: Date.now() });
    return true;
  },
});
