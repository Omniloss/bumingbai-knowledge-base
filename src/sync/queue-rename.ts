import { rename } from "node:fs/promises";

const windowsRenameAttempts = 3;

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
): Promise<void> {
  for (let attempt = 0; attempt < windowsRenameAttempts; attempt += 1) {
    await revalidate();
    try {
      await rename(temporaryPath, destination);
      return;
    } catch (error: unknown) {
      if (
        process.platform !== "win32" ||
        errorCode(error) !== "EPERM" ||
        attempt === windowsRenameAttempts - 1
      ) {
        throw error;
      }
      await wait(10 * (attempt + 1));
    }
  }
}
