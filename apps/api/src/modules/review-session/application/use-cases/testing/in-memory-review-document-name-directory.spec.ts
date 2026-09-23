import { InMemoryReviewDocumentNameDirectory } from './in-memory-review-document-name-directory';

// review-export/design.md Decision 4, tasks.md 3.4: this fake, like
// InMemoryUserDirectory, has no `deletedAt`/deactivation concept at all —
// a seeded community, company or element always resolves, mirroring the
// Prisma adapter's deliberate bypass of ADR-010's default soft-delete
// filter and of `findActiveByCommunityAndType`'s deactivation filter. Each
// scenario below seeds an entity described AS soft-deleted or deactivated
// specifically to document that the fake's contract does not distinguish
// that state at all — there is no seed parameter for it to omit.
describe('InMemoryReviewDocumentNameDirectory', () => {
  describe('findCommunityName', () => {
    it('a soft-deleted community still resolves its name', async () => {
      const directory = new InMemoryReviewDocumentNameDirectory();
      directory.seedCommunity('community-1', 'Sunset Towers');

      const result = await directory.findCommunityName('community-1');

      expect(result).toBe('Sunset Towers');
    });

    it('an id with no row resolves null, not an error', async () => {
      const directory = new InMemoryReviewDocumentNameDirectory();

      const result = await directory.findCommunityName('unknown-id');

      expect(result).toBeNull();
    });
  });

  describe('findMaintenanceCompanyName', () => {
    it('a soft-deleted maintenance company still resolves its name', async () => {
      const directory = new InMemoryReviewDocumentNameDirectory();
      directory.seedMaintenanceCompany('company-1', 'Acme Maintenance');

      const result = await directory.findMaintenanceCompanyName('company-1');

      expect(result).toBe('Acme Maintenance');
    });

    it('an id with no row resolves null, not an error', async () => {
      const directory = new InMemoryReviewDocumentNameDirectory();

      const result = await directory.findMaintenanceCompanyName('unknown-id');

      expect(result).toBeNull();
    });
  });

  describe('findElementsByIds', () => {
    it('a deactivated element still resolves its real code, name and location', async () => {
      const directory = new InMemoryReviewDocumentNameDirectory();
      directory.seedElement('element-deactivated', {
        code: 'ELEV-01',
        name: 'Main Elevator',
        location: 'Lobby',
      });

      const result = await directory.findElementsByIds(['element-deactivated']);

      expect(result.get('element-deactivated')).toEqual({
        code: 'ELEV-01',
        name: 'Main Elevator',
        location: 'Lobby',
      });
    });

    it('a soft-deleted element still resolves its real code, name and location', async () => {
      const directory = new InMemoryReviewDocumentNameDirectory();
      directory.seedElement('element-deleted', {
        code: 'BOIL-02',
        name: 'Boiler Room Unit',
        location: 'Basement',
      });

      const result = await directory.findElementsByIds(['element-deleted']);

      expect(result.get('element-deleted')).toEqual({
        code: 'BOIL-02',
        name: 'Boiler Room Unit',
        location: 'Basement',
      });
    });

    it('resolves every seeded id in one call, regardless of id count', async () => {
      const directory = new InMemoryReviewDocumentNameDirectory();
      directory.seedElement('element-1', {
        code: 'A-1',
        name: 'Element One',
        location: 'Roof',
      });
      directory.seedElement('element-2', {
        code: 'A-2',
        name: 'Element Two',
        location: 'Roof',
      });

      const result = await directory.findElementsByIds([
        'element-1',
        'element-2',
      ]);

      expect(result.size).toBe(2);
    });

    it('an id with no row at all is absent from the map, not an error', async () => {
      const directory = new InMemoryReviewDocumentNameDirectory();
      directory.seedElement('element-1', {
        code: 'A-1',
        name: 'Element One',
        location: 'Roof',
      });

      const result = await directory.findElementsByIds([
        'element-1',
        'unknown-id',
      ]);

      expect(result.has('unknown-id')).toBe(false);
    });

    it('an empty id list resolves to an empty map', async () => {
      const directory = new InMemoryReviewDocumentNameDirectory();

      const result = await directory.findElementsByIds([]);

      expect(result.size).toBe(0);
    });
  });
});
