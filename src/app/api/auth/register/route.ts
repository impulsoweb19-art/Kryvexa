import { assertSameOrigin, clientIp, ok, parseJson, route } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { consume, RULES } from "@/lib/rate-limit";
import { registerUser } from "@/server/services/auth";

export const runtime = "nodejs";

export const POST = route("auth.register", async (req) => {
  assertSameOrigin(req);
  await consume(RULES.register, clientIp(req));

  const input = await parseJson(req, registerSchema);
  const user = await registerUser({
    name: input.name,
    email: input.email,
    phone: input.phone,
    password: input.password,
  });

  return ok({ user }, 201);
});
