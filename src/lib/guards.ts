import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "./session";

/**
 * Guardas para páginas (Server Components).
 *
 * En una API contestamos 401/403; en una página lo correcto es redirigir.
 * `next` conserva el destino para volver tras el login.
 */
export async function requireUserPage(next?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  return user;
}

export async function requireAdminPage(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  // Un usuario normal que adivine la URL recibe un 404, no un "403": no le
  // confirmamos siquiera que exista un panel.
  if (user.role !== "ADMIN") redirect("/tienda");
  return user;
}
