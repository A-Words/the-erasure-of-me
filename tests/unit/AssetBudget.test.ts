import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function directoryBytes(path: string): number {
  return readdirSync(path, { withFileTypes: true }).reduce((sum, entry) => {
    const entryPath = join(path, entry.name);
    return sum + (entry.isDirectory() ? directoryBytes(entryPath) : statSync(entryPath).size);
  }, 0);
}

describe('release asset budget', () => {
  it('keeps all public assets below the 40 MB total budget', () => {
    const bytes = directoryBytes(join(process.cwd(), 'public', 'assets'));

    expect(bytes).toBeLessThanOrEqual(40 * 1024 * 1024);
  });
});
