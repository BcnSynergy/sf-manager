import {
  MaintenanceCompany as PrismaMaintenanceCompany,
  Prisma,
} from '@prisma/client';
import { MaintenanceCompany } from '../../domain/maintenance-company.entity';

// ADR-013: dedicated mapper between Prisma's row-shaped query result and the
// hand-written domain entity — mirrors CommunityMapper/UserMapper.
export class MaintenanceCompanyMapper {
  static toDomain(record: PrismaMaintenanceCompany): MaintenanceCompany {
    return new MaintenanceCompany({
      id: record.id,
      name: record.name,
      taxId: record.taxId,
      contactInfo: record.contactInfo,
      deletedAt: record.deletedAt,
    });
  }

  static toPersistence(
    company: MaintenanceCompany,
  ): Prisma.MaintenanceCompanyCreateInput {
    return {
      id: company.id,
      name: company.name,
      taxId: company.taxId,
      contactInfo: company.contactInfo,
      deletedAt: company.deletedAt,
    };
  }
}
