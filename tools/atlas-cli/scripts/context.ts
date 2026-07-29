import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(scriptDirectory, "..", "..", ".."));
process.argv[1] = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
process.argv.splice(2, 0, "context");

await import("../src/cli.ts");
