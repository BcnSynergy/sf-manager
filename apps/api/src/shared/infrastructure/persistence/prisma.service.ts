import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// The one place @prisma/client may be imported (ADR-013), enforced by the
// root ESLint config's no-restricted-imports rule for everywhere else under
// apps/api/src. Repository implementations inject this service and map
// Prisma's results to hand-written domain entities themselves.
//
// Prisma 7: the datasource `url` is no longer read from schema.prisma at
// runtime, so PrismaClient needs an explicit driver adapter constructed from
// DATABASE_URL (see https://pris.ly/d/prisma7-client-config).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
