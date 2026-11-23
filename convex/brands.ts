import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Reference implementation of the issue-50 identity boundary: every function
// derives the owner from ctx.auth.getUserIdentity() and refuses anything it
// cannot verify. Caller-supplied owner ids are never accepted.

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return null;
    }
    return await ctx.db
      .query("brands")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject as import("./_generated/dataModel").Id<"users">))
      .collect();
  },
});

export const createBrand = mutation({
  args: { name: v.string() },
  returns: v.id("brands"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not signed in");
    }
    const name = args.name.trim();
    if (name.length === 0) {
      throw new Error("Brand name is required");
    }
    return await ctx.db.insert("brands", {
      ownerId: identity.subject as import("./_generated/dataModel").Id<"users">,
      name,
      createdAt: Date.now(),
    });
  },
});

export const deleteBrand = mutation({
  args: { brandId: v.id("brands") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not signed in");
    }
    const brand = await ctx.db.get(args.brandId);
    if (brand === null || brand.ownerId !== (identity.subject as import("./_generated/dataModel").Id<"users">)) {
      throw new Error("Not found");
    }
    await ctx.db.delete(args.brandId);
  },
});
