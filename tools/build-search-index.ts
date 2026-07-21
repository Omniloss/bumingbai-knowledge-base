import { mkdir, writeFile } from "node:fs/promises";
import { loadCatalog } from "../src/lib/catalog.js";
import {
  buildSearchIndex,
  serializeSearchIndex,
} from "../src/lib/search-index.js";

const outputDirectory = new URL("../public/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  new URL("search-index.json", outputDirectory),
  serializeSearchIndex(buildSearchIndex(await loadCatalog())),
  "utf8",
);
