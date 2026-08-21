import { randomBytes, randomUUID } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin I, O, 0, 1

/** Código legible y no adivinable: ORD-7K3M9QF2 */
export function humanCode(prefix: string, length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}-${out}`;
}

export const newUuid = (): string => randomUUID();

/** Token opaco para la cookie de sesión (256 bits). */
export const secureToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");
