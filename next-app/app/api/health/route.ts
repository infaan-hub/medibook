import { handler, ok } from "@/lib/route";
import { prisma } from "@/lib/db";

/**
 * GET /api/health/ — unauthenticated readiness probe.
 * Never exposes credentials or internal details (§36).
 */
export const GET = handler(async () => {
  let database: "connected" | "unavailable" = "connected";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "unavailable";
  }
  return ok(
    {
      service: "medibook-api",
      version: process.env.APP_VERSION ?? "0.1.0",
      database,
    },
    "MediBook API is running."
  );
});
