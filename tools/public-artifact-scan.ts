import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";

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
  path: string,
  sentinel: Buffer,
): Promise<void> {
  await scanRegularFile(path, sentinel);
}

export async function scanPublicDirectory(
  directory: string,
  sentinel: Buffer,
): Promise<void> {
  const before = await lstat(directory);
  if (!before.isDirectory() || before.isSymbolicLink()) throw nonregular();
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scanPublicDirectory(path, sentinel);
    else await scanRegularFile(path, sentinel);
  }
  const after = await lstat(directory);
  if (!after.isDirectory() || !sameIdentity(before, after)) throw nonregular();
}
