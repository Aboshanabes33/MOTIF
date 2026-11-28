import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    workosUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    // Plan the user picked after signup. Paid plans are "coming soon": they are recorded as a
    // choice only and the account stays on the free tier until Whop sandbox payments are wired.
    plan: v.optional(v.union(v.literal("free"), v.literal("monthly"), v.literal("yearly"))),
    planStatus: v.optional(v.union(v.literal("active"), v.literal("coming_soon"), v.literal("inactive"))),
    planChosenAt: v.optional(v.number()),
  }).index("by_token", ["tokenIdentifier"]),
});
