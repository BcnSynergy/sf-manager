import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { FileStorage } from '../../application/ports/file-storage.port';

// Lowercase segments separated by single slashes, with an optional
// extension on the last one: no `..`, no absolute path, no empty segment.
// Keys are built by the application, so anything else is a bug and must
// never reach the disk.
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*(\.[a-z0-9]+)?$/;

// FileStorage adapter on a local directory (a Docker volume in production,
// FILE_STORAGE_DIR). A put writes to a temporary file and renames it over
// the target, so a reader never sees a half-written file.
export class LocalFileStorage implements FileStorage {
  constructor(private readonly root: string) {}

  async put(key: string, content: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, content);
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async get(key: string): Promise<Buffer | null> {
    const path = this.pathFor(key);
    try {
      return await readFile(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  private pathFor(key: string): string {
    if (!KEY_PATTERN.test(key)) {
      throw new Error(`Invalid file storage key: "${key}"`);
    }
    return join(this.root, ...key.split('/'));
  }
}
