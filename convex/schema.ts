import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Account profiles. Rows are created by the auth component callback in
  // users.ts; identity binding always comes from ctx.auth.getUserIdentity(),
  // never from a caller-supplied user id.
  users: defineTable({
    displayName: v.optional(v.string()),
    createdAt: v.number(),
  }),

  // First identity-bound application table: every Brand belongs to exactly
  // one verified owner. This is the reference pattern for migrating the
  // legacy local Host Brand folders (see AUTH.md): owner namespace is
  // derived from the verified issuer+subject at call time, and cross-owner
  // reads and writes are refused at the function boundary.
  brands: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    createdAt: v.number(),
  }).index("by_owner", ["ownerId"]),
});
