import "server-only";

import bcrypt from "bcryptjs";

/**
 * bcrypt con coste 12 (~250 ms en un VPS modesto). Suficiente para frenar
 * fuerza bruta offline sin castigar el login legítimo.
 *
 * bcrypt ignora todo lo que exceda 72 bytes; por eso `passwordSchema`
 * limita la contraseña a 72 caracteres y no lo dejamos al azar.
 */
const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Hash falso con el mismo coste. Se usa cuando el email no existe, para que el
 * tiempo de respuesta del login no revele si la cuenta está registrada.
 */
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO1/9G0zVfmH1n2p3T7yv4Zt.6nQ7Ry6a";

export async function fakeVerify(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH).catch(() => false);
}
