import { assertSameOrigin, ok, parseJson, route } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { settingsSchema } from "@/lib/validation";
import { getConfig, setConfig } from "@/server/services/settings";
import { recordAudit } from "@/server/services/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = route("admin.settings.update", async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();
  const input = await parseJson(req, settingsSchema);

  await setConfig(input);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "settings.update",
    entityType: "settings",
    // No se registran secretos: aquí solo hay configuración comercial.
    meta: { exchangeRate: input.exchangeRate, marginBps: input.marginBps },
  });

  return ok(await getConfig());
});
