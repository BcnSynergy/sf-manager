import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  FileStorage,
  StoredFile,
} from '../../application/ports/file-storage.port';

// Lowercase segments separated by single slashes, with an optional
// extension on the last one: no `..`, no absolute path, no empty segment.
// Keys are built by the application, so anything else is a bug and must
// never reach the disk.
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*(\.[a-z0-9]+)?$/;

// The temporary file a put writes before renaming it: `<last key segment>.
// <uuid>.tmp`. Only a name of this shape is ever deleted as an unfinished
// write.
const TEMPORARY_NAME_PATTERN =
  /^[a-z0-9][a-z0-9-]*(\.[a-z0-9]+)?\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/;

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

  // A temporary file of a put in progress (or one interrupted by a crash)
  // has a name that is not a valid key, so it is never listed: only
  // complete files are.
  async list(directory: string): Promise<StoredFile[]> {
    const directoryPath = this.pathFor(directory);
    let entries: Dirent[];
    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const files: StoredFile[] = [];
    for (const entry of entries) {
      const key = `${directory}/${entry.name}`;
      if (!entry.isFile() || !KEY_PATTERN.test(key)) continue;
      try {
        const { mtime } = await stat(join(directoryPath, entry.name));
        files.push({ key, storedAt: mtime });
      } catch (error) {
        // Deleted between the listing and the stat: nothing to list.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return files;
  }

  // EN-234: a put interrupted by a crash leaves its temporary file; a failed
  // write removes its own. Such a file older than the cutoff can no longer
  // belong to a put in progress.
  async deleteUnfinishedWrites(
    directory: string,
    startedBefore: Date,
  ): Promise<number> {
    const directoryPath = this.pathFor(directory);
    let entries: Dirent[];
    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw error;
    }
    let deleted = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !TEMPORARY_NAME_PATTERN.test(entry.name)) continue;
      const path = join(directoryPath, entry.name);
      try {
        const { mtime } = await stat(path);
        if (mtime.getTime() >= startedBefore.getTime()) continue;
        await rm(path);
        deleted += 1;
      } catch (error) {
        // Renamed or deleted meanwhile: nothing left to delete.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return deleted;
  }

  private pathFor(key: string): string {
    if (!KEY_PATTERN.test(key)) {
      throw new Error(`Invalid file storage key: "${key}"`);
    }
    return join(this.root, ...key.split('/'));
  }
}
