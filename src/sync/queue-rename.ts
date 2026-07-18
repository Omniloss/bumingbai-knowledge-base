import { rename } from "node:fs/promises";

const windowsRenameAttempts = 3;

type Rename = (oldPath: string, newPath: string) => Promise<void>;

type RenameQueueOptions = {
  platform?: NodeJS.Platform;
  rename?: Rename;
  wait?: (milliseconds: number) => Promise<void>;
};

function errorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => {
    setTimeout(resolveWait, milliseconds);
  });
}

export async function renameQueue(
  temporaryPath: string,
  destination: string,
  revalidate: () => Promise<void>,
  options: RenameQueueOptions = {},
): Promise<void> {
  const platform = options.platform ?? process.platform;
  const renameFile = options.rename ?? rename;
  const pause = options.wait ?? wait;
  for (let attempt = 0; attempt < windowsRenameAttempts; attempt += 1) {
    await revalidate();
    try {
      await renameFile(temporaryPath, destination);
      return;
    } catch (error: unknown) {
      if (
        platform !== "win32" ||
        errorCode(error) !== "EPERM" ||
        attempt === windowsRenameAttempts - 1
      ) {
        throw error;
      }
      await pause(10 * (attempt + 1));
    }
  }
}
