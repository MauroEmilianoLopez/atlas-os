import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(CLI_DIR, "../../..");
const DEFAULT_VAULT_ROOT = path.join(REPOSITORY_ROOT, "vault-prototype");

export interface VaultResolution {
  readonly root: string;
  readonly explicit: boolean;
}

export function resolveVaultRoot(vault?: string): VaultResolution | { readonly ok: false; readonly message: string } {
  const explicit = typeof vault === "string" && vault.trim().length > 0;
  const root = explicit ? path.resolve(process.cwd(), vault) : DEFAULT_VAULT_ROOT;

  if (fs.existsSync(root)) {
    return { root, explicit };
  }

  const tried = explicit ? [root] : [DEFAULT_VAULT_ROOT];
  return {
    ok: false,
    message: [
      "No se encontró un vault válido.",
      "Intenté:",
      ...tried.map((candidate) => `- ${candidate}`),
      "Ejecuta el comando desde el repositorio o pasa explícitamente la ruta del vault.",
    ].join("\n"),
  };
}
