import { mutationGeneric, queryGeneric } from "convex/server";
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
