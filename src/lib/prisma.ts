import { PrismaClient } from "@prisma/client";

// Next.js dev server hot-reloads modules; without this a new pool is opened on
// every reload until the database refuses connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** A PrismaClient or an interactive-transaction client. */
export type Db = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
