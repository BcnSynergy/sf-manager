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
});
