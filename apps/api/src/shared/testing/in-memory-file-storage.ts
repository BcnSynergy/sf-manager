import type { FileStorage } from '../application/ports/file-storage.port';

// Test double for the FileStorage port: keys map to copies of the stored
// bytes, so a test can assert exactly which keys exist after an operation.
export class InMemoryFileStorage implements FileStorage {
  private readonly files = new Map<string, Buffer>();

  put(key: string, content: Buffer): Promise<void> {
    this.files.set(key, Buffer.from(content));
    return Promise.resolve();
  }

  get(key: string): Promise<Buffer | null> {
    const content = this.files.get(key);
    return Promise.resolve(content ? Buffer.from(content) : null);
  }

  delete(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }

  keys(): string[] {
    return [...this.files.keys()].sort();
  }
}
