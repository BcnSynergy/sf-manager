import { mkdtemp, readdir, rm } from 'node:fs/promises';
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
});
