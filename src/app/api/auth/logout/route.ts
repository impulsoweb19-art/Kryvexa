import { assertSameOrigin, ok, route } from "@/lib/api";
import { destroySession } from "@/lib/session";

export const runtime = "nodejs";

export const POST = route("auth.logout", async (req) => {
  assertSameOrigin(req);
  await destroySession();
  return ok({ loggedOut: true });
});
