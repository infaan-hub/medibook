import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma, PrismaClient } from "@prisma/client";

/** Database identity is request-scoped and installed with transaction-local
 * PostgreSQL settings. This works safely with pooled/serverless connections. */
export type DatabaseIdentity = {
  userId: number | null;
  role: string;
  mode: "user" | "token" | "auth" | "anonymous" | "system";
  isSuperuser?: boolean;
};

const identityStorage = new AsyncLocalStorage<DatabaseIdentity>();
const transactionStorage = new AsyncLocalStorage<Prisma.TransactionClient>();
const globalForPrisma = globalThis as unknown as { __medibook_prisma?: PrismaClient };
const base = globalForPrisma.__medibook_prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.__medibook_prisma = base;

export function withDatabaseIdentity<T>(identity: DatabaseIdentity, fn: () => Promise<T>): Promise<T> {
  return identityStorage.run(identity, fn);
}

async function setTransactionIdentity(tx: Prisma.TransactionClient, identity: DatabaseIdentity) {
  // The Neon URL uses a database owner (which bypasses RLS). Switch each
  // request transaction to a non-login, non-bypass application role so the
  // policies below are enforced even when the connection owner is privileged.
  await tx.$executeRawUnsafe("SET LOCAL ROLE medibook_runtime");
  await tx.$queryRaw`SELECT
    set_config('app.user_id', ${identity.userId == null ? "" : String(identity.userId)}, true),
    set_config('app.role', ${identity.role}, true),
    set_config('app.mode', ${identity.mode}, true),
    set_config('app.is_superuser', ${identity.isSuperuser ? "true" : "false"}, true)`;
}

const scoped = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const identity = identityStorage.getStore();
        const activeTransaction = transactionStorage.getStore();
        if (activeTransaction) return (activeTransaction as any)[model][operation](args);
        if (!identity) return query(args);
        return base.$transaction(async (tx) => {
          await setTransactionIdentity(tx, identity);
          return transactionStorage.run(tx, () => (tx as any)[model][operation](args));
        });
      },
    },
  },
});

// Interactive transactions are common in write workflows. Set identity once
// at transaction start; callback queries then share its snapshot and settings.
export const prisma = new Proxy(scoped as any, {
  get(target, property, receiver) {
    if (["$queryRaw", "$executeRaw", "$queryRawUnsafe", "$executeRawUnsafe"].includes(String(property))) {
      const rawMethod = Reflect.get(target, property, receiver).bind(target);
      return (...args: any[]) => {
        const identity = identityStorage.getStore();
        const activeTransaction = transactionStorage.getStore();
        if (activeTransaction) return (activeTransaction as any)[property](...args);
        if (!identity) return rawMethod(...args);
        return base.$transaction(async (tx) => {
          await setTransactionIdentity(tx, identity);
          return transactionStorage.run(tx, () => (tx as any)[property](...args));
        });
      };
    }
    if (property === "$transaction") {
      return (arg: any, options?: any) => {
        const activeTransaction = transactionStorage.getStore();
        if (activeTransaction && typeof arg === "function") return arg(activeTransaction);
        const identity = identityStorage.getStore();
        if (typeof arg !== "function" || !identity) return base.$transaction(arg, options);
        return base.$transaction(async (tx) => {
          await setTransactionIdentity(tx, identity);
          return transactionStorage.run(tx, () => arg(tx));
        }, options);
      };
    }
    return Reflect.get(target, property, receiver);
  },
}) as PrismaClient;
