import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArguments(arguments_) {
  const value = (name) => {
    const index = arguments_.indexOf(name);
    return index >= 0 ? arguments_[index + 1] : null;
  };
  const channel = value('--channel');
  const positional = arguments_.filter(
    (argument, index) =>
      !argument.startsWith('--') &&
      arguments_[index - 1] !== '--channel' &&
      arguments_[index - 1] !== '--evidence',
  );
  const evidence = value('--evidence') ?? positional[0] ?? null;
  if (!['internal', 'public'].includes(channel))
    throw new Error('Use --channel internal or --channel public');
  return { channel, evidence };
}

function assertCleanWorktree(root) {
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  if (status) throw new Error('Release packaging requires a clean Git worktree');
}

function assertPublicGates(root, evidencePath) {
  if (!existsSync(join(root, 'LICENSE')))
    throw new Error('Public packaging requires a project-level LICENSE file');
  if (!evidencePath) throw new Error('Public packaging requires a PASS evidence report path');
  const evidence = readFileSync(resolve(root, evidencePath), 'utf8');
  if (!evidence.includes('> 结论：PASS') || evidence.includes('| FAIL |'))
    throw new Error('Public packaging requires a PASS external evidence report');
  const registry = readFileSync(join(root, 'docs', 'ASSET_REGISTRY.md'), 'utf8');
  if (/\|\s*review\s*\|/i.test(registry))
    throw new Error('Public packaging requires all asset registry review statuses to be closed');
}

function ensureInside(parent, child) {
  const prefix = parent.endsWith(sep) ? parent : `${parent}${sep}`;
  if (!child.startsWith(prefix)) throw new Error(`Refusing to write outside ${parent}`);
}

function copyTree(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name.endsWith('.map')) continue;
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);
    if (entry.isDirectory()) copyTree(sourcePath, targetPath);
    else copyFileSync(sourcePath, targetPath);
  }
}

function collectFiles(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(root, path);
    if (entry.name === 'release-manifest.json') return [];
    const contents = readFileSync(path);
    return [
      {
        path: relative(root, path).split(sep).join('/'),
        bytes: statSync(path).size,
        sha256: createHash('sha256').update(contents).digest('hex'),
      },
    ];
  });
}

export function packageRelease(root, options) {
  assertCleanWorktree(root);
  if (options.channel === 'public') assertPublicGates(root, options.evidence);
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const dist = join(root, 'dist');
  if (!existsSync(join(dist, 'index.html'))) throw new Error('Run npm run build before packaging');

  const releaseRoot = resolve(root, 'release');
  const output = resolve(
    releaseRoot,
    `${packageJson.name}-v${packageJson.version}-${options.channel}`,
  );
  ensureInside(releaseRoot, output);
  if (existsSync(output)) rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  copyTree(dist, output);
  copyFileSync(
    join(root, 'docs', `RELEASE_NOTES_v${packageJson.version}.md`),
    join(output, 'RELEASE_NOTES.md'),
  );

  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const files = collectFiles(output).sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    name: packageJson.name,
    version: packageJson.version,
    channel: options.channel,
    commit,
    generatedAt: new Date().toISOString(),
    sourceMapsIncluded: false,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
  writeFileSync(join(output, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { output, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const root = process.cwd();
    const options = parseArguments(process.argv.slice(2));
    const result = packageRelease(root, options);
    process.stdout.write(
      `Packaged ${result.manifest.channel} release at ${result.output}\n${result.manifest.files.length} files, ${result.manifest.totalBytes} bytes\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
