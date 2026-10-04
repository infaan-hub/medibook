import { PrismaClient } from "@prisma/client";

// Singleton Prisma client (shared across dev HMR reloads and the custom
// server process — server.js assigns globalThis.__medibook_prisma first when
// it is running, so exactly one connection pool exists per process).
const globalForPrisma = globalThis as unknown as { __medibook_prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.__medibook_prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__medibook_prisma = prisma;
}
