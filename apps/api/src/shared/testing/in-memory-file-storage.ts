import type {
  FileStorage,
  StoredFile,
} from '../application/ports/file-storage.port';

// Test double for the FileStorage port: keys map to copies of the stored
// bytes, so a test can assert exactly which keys exist after an operation.
export class InMemoryFileStorage implements FileStorage {
  private readonly files = new Map<string, Buffer>();
  private readonly storedAt = new Map<string, Date>();
  // Leftovers of writes that never finished, by key, with when each started.
  private readonly unfinished = new Map<string, Date>();

  put(key: string, content: Buffer): Promise<void> {
    this.files.set(key, Buffer.from(content));
    this.storedAt.set(key, new Date());
    return Promise.resolve();
  }

  // Test helper: pretends the key was stored at `at` (EN-222 sweep tests).
  setStoredAt(key: string, at: Date): void {
    this.storedAt.set(key, at);
  }

  // Test helper: pretends a put of `key` started at `at` and never finished
  // (EN-234 sweep tests). The key is not stored, so get and list ignore it.
  leaveUnfinishedWrite(key: string, at: Date): void {
    this.unfinished.set(key, at);
  }

  unfinishedWriteKeys(): string[] {
    return [...this.unfinished.keys()].sort();
  }

  deleteUnfinishedWrites(
    directory: string,
    startedBefore: Date,
  ): Promise<number> {
    let deleted = 0;
    for (const [key, startedAt] of this.unfinished) {
      if (
        isDirectlyUnder(key, directory) &&
        startedAt.getTime() < startedBefore.getTime()
      ) {
        this.unfinished.delete(key);
        deleted += 1;
      }
    }
    return Promise.resolve(deleted);
  }

  list(directory: string): Promise<StoredFile[]> {
    return Promise.resolve(
      [...this.files.keys()]
        .filter((key) => isDirectlyUnder(key, directory))
        .map((key) => ({
          key,
          storedAt: this.storedAt.get(key) ?? new Date(0),
        })),
    );
  }

  get(key: string): Promise<Buffer | null> {
    const content = this.files.get(key);
    return Promise.resolve(content ? Buffer.from(content) : null);
  }

  delete(key: string): Promise<void> {
    this.files.delete(key);
    this.storedAt.delete(key);
    return Promise.resolve();
  }

  keys(): string[] {
    return [...this.files.keys()].sort();
  }
}

function isDirectlyUnder(key: string, directory: string): boolean {
  const prefix = `${directory}/`;
  return key.startsWith(prefix) && !key.slice(prefix.length).includes('/');
}
