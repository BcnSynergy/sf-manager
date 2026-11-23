import type {
  FileStorage,
  StoredFile,
} from '../application/ports/file-storage.port';

// Test double for the FileStorage port: keys map to copies of the stored
// bytes, so a test can assert exactly which keys exist after an operation.
export class InMemoryFileStorage implements FileStorage {
  private readonly files = new Map<string, Buffer>();
  private readonly storedAt = new Map<string, Date>();

  put(key: string, content: Buffer): Promise<void> {
    this.files.set(key, Buffer.from(content));
    this.storedAt.set(key, new Date());
    return Promise.resolve();
  }

  // Test helper: pretends the key was stored at `at` (EN-222 sweep tests).
  setStoredAt(key: string, at: Date): void {
    this.storedAt.set(key, at);
  }

  list(directory: string): Promise<StoredFile[]> {
    const prefix = `${directory}/`;
    return Promise.resolve(
      [...this.files.keys()]
        .filter(
          (key) =>
            key.startsWith(prefix) && !key.slice(prefix.length).includes('/'),
        )
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
