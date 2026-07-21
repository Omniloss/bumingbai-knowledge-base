import { lstat, open, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const chunkSize = 64 * 1024;

function nonregular(): Error {
  return new Error("Public output contains a nonregular entry");
}

function sameIdentity(
  left: { dev: number; ino: number },
  right: { dev: number; ino: number },
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function within(root: string, path: string): boolean {
  const difference = relative(root, path);
  return (
    difference === "" ||
    (!difference.startsWith(`..${sep}`) &&
      difference !== ".." &&
      !isAbsolute(difference))
  );
}

async function validateAncestors(root: string, path: string): Promise<void> {
  const rootPath = resolve(root);
  const rootRealPath = await realpath(rootPath);
  const difference = relative(rootPath, resolve(path));
  if (!within(rootPath, resolve(path))) throw nonregular();
  let current = rootPath;
  for (const segment of difference.split(sep).slice(0, -1)) {
    current = join(current, segment);
    const stats = await lstat(current);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw nonregular();
    if (!within(rootRealPath, await realpath(current))) throw nonregular();
  }
}

async function scanRegularFile(path: string, sentinel: Buffer): Promise<void> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) throw nonregular();
  const file = await open(path, "r");
  try {
    const opened = await file.stat();
    if (!opened.isFile() || !sameIdentity(before, opened)) throw nonregular();
    const buffer = Buffer.allocUnsafe(chunkSize + sentinel.length - 1);
    let position = 0;
    let retained = 0;
    while (true) {
      const { bytesRead } = await file.read(
        buffer,
        retained,
        chunkSize,
        position,
      );
      if (bytesRead === 0) break;
      const length = retained + bytesRead;
      if (buffer.subarray(0, length).includes(sentinel)) {
        throw new Error(
          "Nonpublic recommendation sentinel leaked into public output",
        );
      }
      retained = Math.min(sentinel.length - 1, length);
      buffer.copy(buffer, 0, length - retained, length);
      position += bytesRead;
    }
    const after = await lstat(path);
    if (!after.isFile() || !sameIdentity(before, after)) throw nonregular();
  } finally {
    await file.close();
  }
}

export async function scanPublicArtifact(
  root: string,
  path: string,
  sentinel: Buffer,
): Promise<void> {
  await validateAncestors(root, path);
  await scanRegularFile(path, sentinel);
}

export async function scanPublicDirectory(
  root: string,
  directory: string,
  sentinel: Buffer,
): Promise<void> {
  await validateAncestors(root, directory);
  const before = await lstat(directory);
  if (!before.isDirectory() || before.isSymbolicLink()) throw nonregular();
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scanPublicDirectory(root, path, sentinel);
    else await scanRegularFile(path, sentinel);
  }
  const after = await lstat(directory);
  if (!after.isDirectory() || !sameIdentity(before, after)) throw nonregular();
}
