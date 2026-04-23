import { PrismaClient } from '@prisma/client';
import { getAppEnvironment, isProductionEnvironment } from './environment.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: getAppEnvironment() === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (!isProductionEnvironment()) globalForPrisma.prisma = prisma;

export default prisma;
