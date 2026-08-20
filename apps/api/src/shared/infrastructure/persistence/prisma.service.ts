import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// The one place @prisma/client may be imported (ADR-013), enforced by the
// root ESLint config's no-restricted-imports rule for everywhere else under
// apps/api/src. Repository implementations inject this service and map
// Prisma's results to hand-written domain entities themselves.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
