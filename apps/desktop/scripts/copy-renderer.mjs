import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rendererDirectory = resolve(scriptDirectory, "../../renderer/dist");
const destinationDirectory = resolve(scriptDirectory, "../dist/renderer");

mkdirSync(destinationDirectory, { recursive: true });
cpSync(rendererDirectory, destinationDirectory, { recursive: true });
