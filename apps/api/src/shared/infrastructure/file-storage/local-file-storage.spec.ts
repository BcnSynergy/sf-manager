import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFileStorage } from './local-file-storage';

describe('LocalFileStorage', () => {
  let root: string;
  let storage: LocalFileStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sf-file-storage-'));
    storage = new LocalFileStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads back what it stored, creating the key prefix as a directory', async () => {
    await storage.put('logos/abc.png', Buffer.from('bytes'));

    expect(await storage.get('logos/abc.png')).toEqual(Buffer.from('bytes'));
    expect(await readdir(join(root, 'logos'))).toEqual(['abc.png']);
  });

  it('replaces the content when the same key is stored again', async () => {
    await storage.put('logos/abc.png', Buffer.from('first'));
    await storage.put('logos/abc.png', Buffer.from('second'));

    expect(await storage.get('logos/abc.png')).toEqual(Buffer.from('second'));
  });

  it('returns null for a key that was never stored', async () => {
    expect(await storage.get('logos/missing.png')).toBeNull();
  });

  it('deletes a stored key, and deleting a missing key succeeds', async () => {
    await storage.put('logos/abc.png', Buffer.from('bytes'));

    await storage.delete('logos/abc.png');
    await storage.delete('logos/abc.png');

    expect(await storage.get('logos/abc.png')).toBeNull();
  });

  it.each([
    '../outside.png',
    'logos/../../outside.png',
    '/abs.png',
    'Logos/A.PNG',
    'logos//a.png',
    '',
  ])('rejects the key %j before touching the disk', async (key) => {
    await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow(
      'Invalid file storage key',
    );
    await expect(storage.get(key)).rejects.toThrow('Invalid file storage key');
    await expect(storage.delete(key)).rejects.toThrow(
      'Invalid file storage key',
    );
    expect(await readdir(root)).toEqual([]);
  });

  // EN-222: the orphan photo file sweep lists a directory's files.
  describe('list', () => {
    it('lists the keys stored directly under a directory, with when each was stored', async () => {
      await storage.put('review-photos/a.jpg', Buffer.from('a'));
      await storage.put('review-photos/b.jpg', Buffer.from('b'));
      await storage.put('logos/c.png', Buffer.from('c'));
      const storedAt = new Date('2026-11-20T10:00:00.000Z');
      await utimes(join(root, 'review-photos', 'a.jpg'), storedAt, storedAt);

      const listed = await storage.list('review-photos');

      expect(listed.map((file) => file.key).sort()).toEqual([
        'review-photos/a.jpg',
        'review-photos/b.jpg',
      ]);
      expect(
        listed.find((file) => file.key === 'review-photos/a.jpg')?.storedAt,
      ).toEqual(storedAt);
    });

    it('lists nothing for a directory that does not exist', async () => {
      expect(await storage.list('review-photos')).toEqual([]);
    });

    it('skips a temporary file left by an interrupted put, and subdirectories', async () => {
      await storage.put('review-photos/a.jpg', Buffer.from('a'));
      await writeFile(join(root, 'review-photos', 'b.jpg.0f9e.tmp'), 'partial');
      await mkdir(join(root, 'review-photos', 'nested'));

      expect(
        (await storage.list('review-photos')).map((file) => file.key),
      ).toEqual(['review-photos/a.jpg']);
    });

    it('rejects a directory that is not a valid key segment', async () => {
      await expect(storage.list('../etc')).rejects.toThrow(
        'Invalid file storage key',
      );
    });
  });

  // EN-234: a put interrupted by a crash leaves its temporary file behind.
  describe('deleteUnfinishedWrites', () => {
    const cutoff = new Date('2026-11-23T11:00:00.000Z');
    const before = new Date('2026-11-23T10:00:00.000Z');
    const after = new Date('2026-11-23T11:30:00.000Z');
    const UUID = '3b241101-e2bb-4255-8caf-4136c566a962';

    const writeAt = async (
      name: string,
      at: Date,
      directory = 'review-photos',
    ) => {
      await mkdir(join(root, directory), { recursive: true });
      const path = join(root, directory, name);
      await writeFile(path, 'partial');
      await utimes(path, at, at);
    };

    it('deletes a temporary file started before the cutoff, keeping newer ones and every complete file', async () => {
      await writeAt(`a.jpg.${UUID}.tmp`, before);
      await writeAt(`b.jpg.${UUID}.tmp`, after);
      await writeAt('old.jpg', before);

      await expect(
        storage.deleteUnfinishedWrites('review-photos', cutoff),
      ).resolves.toBe(1);

      expect((await readdir(join(root, 'review-photos'))).sort()).toEqual([
        `b.jpg.${UUID}.tmp`,
        'old.jpg',
      ]);
    });

    it('only looks directly under the directory', async () => {
      await writeAt(`d.png.${UUID}.tmp`, before, 'logos');
      await writeAt(`e.jpg.${UUID}.tmp`, before, 'review-photos/nested');

      await expect(
        storage.deleteUnfinishedWrites('review-photos', cutoff),
      ).resolves.toBe(0);

      expect(await readdir(join(root, 'logos'))).toHaveLength(1);
      expect(await readdir(join(root, 'review-photos', 'nested'))).toHaveLength(
        1,
      );
    });

    it('leaves a file that only looks temporary but is not a put leftover', async () => {
      await writeAt('notes.tmp', before);
      await writeAt('f.jpg.not-a-uuid.tmp', before);

      await expect(
        storage.deleteUnfinishedWrites('review-photos', cutoff),
      ).resolves.toBe(0);

      expect(await readdir(join(root, 'review-photos'))).toHaveLength(2);
    });

    it('deletes nothing for a directory that does not exist', async () => {
      await expect(
        storage.deleteUnfinishedWrites('review-photos', cutoff),
      ).resolves.toBe(0);
    });

    it('rejects a directory that is not a valid key segment', async () => {
      await expect(
        storage.deleteUnfinishedWrites('../etc', cutoff),
      ).rejects.toThrow('Invalid file storage key');
    });
  });
});
