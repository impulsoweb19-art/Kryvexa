import { assertSameOrigin, clientIp, ok, parseJson, route } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import { consume, RULES } from "@/lib/rate-limit";
import { loginUser } from "@/server/services/auth";

export const runtime = "nodejs";

export const POST = route("auth.login", async (req) => {
  assertSameOrigin(req);

  const input = await parseJson(req, loginSchema);

  // Doble límite: por IP (frena escaneos) y por cuenta (frena el ataque dirigido
  // a un usuario concreto desde muchas IPs).
  await consume(RULES.login, clientIp(req));
  await consume(RULES.login, `email:${input.email}`);

  const user = await loginUser(input.email, input.password);
  return ok({ user });
});
