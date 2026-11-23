import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createUser = internalMutation({
  args: {
    method: v.object({
      name: v.literal("emailPassword"),
      profile: v.object({}),
    }),
  },
  returns: v.id("users"),
  handler: async (ctx) => {
    return await ctx.db.insert("users", { createdAt: Date.now() });
  },
});

// Returns the caller's own user row, or null when signed out. The id comes
// from the verified token, not from any argument.
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return null;
    }
    return await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("_id"), identity.subject))
      .first();
  },
});
