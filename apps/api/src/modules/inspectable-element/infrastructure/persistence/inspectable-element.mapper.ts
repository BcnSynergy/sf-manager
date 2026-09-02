import {
  InspectableElement as PrismaInspectableElement,
  Prisma,
} from '@prisma/client';
import { InspectableElement } from '../../domain/inspectable-element.entity';

// design.md Decision 1: the mapper's direct assignment (no cast, no switch)
// is one of the four compile-time gates closing the `ElementType` three-way
// seam. `CommunityMapper`/`UserMapper` translate `Locale`/`Role` the same
// way because the value sets are identical strings — structural
// assignability already fails the build in BOTH directions if a value is
// ever added to one side and not the other. An exhaustive switch would add
// a hand-maintained `case 'X': return 'X'` arm per value for no benefit
// (design.md Decision 1, "Option for the mapper").
export class InspectableElementMapper {
  static toDomain(record: PrismaInspectableElement): InspectableElement {
    return new InspectableElement({
      id: record.id,
      communityId: record.communityId,
      elementType: record.elementType,
      name: record.name,
      description: record.description,
      location: record.location,
      installedAt: record.installedAt,
      serialNumber: record.serialNumber,
      deletedAt: record.deletedAt,
    });
  }

  static toPersistence(
    element: InspectableElement,
  ): Prisma.InspectableElementCreateInput {
    return {
      id: element.id,
      communityId: element.communityId,
      elementType: element.elementType,
      name: element.name,
      description: element.description,
      location: element.location,
      installedAt: element.installedAt,
      serialNumber: element.serialNumber,
      deletedAt: element.deletedAt,
    };
  }
}
