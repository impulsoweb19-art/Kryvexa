import { Alert, Card } from "@/components/ui";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { YapeQrManager } from "@/components/admin/YapeQrManager";
import { getConfig, yapeQrSrc } from "@/server/services/settings";
import { providerHealth } from "@/server/services/stats";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const [config, health] = await Promise.all([getConfig(), providerHealth()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="mt-1 text-sm text-muted">
          Datos de cobro, precios y contacto. Los cambios se aplican de inmediato.
        </p>
      </div>

      {/* La API key NO se administra desde aquí, y se explica por qué. */}
      <Card className="border-plasma-500/30">
        <h2 className="font-bold">Credenciales del proveedor</h2>
        <p className="mt-2 text-sm text-muted">
          La API key de RecargasAmérica no se configura desde esta pantalla: vive únicamente como
          variable de entorno del servidor (<code className="text-plasma-400">RECARGAS_AMERICA_API_KEY</code>).
          Guardarla en la base de datos o mostrarla en un formulario aumentaría la superficie de
          exposición sin ninguna ventaja.
        </p>
        <div className="mt-3">
          {health.configured ? (
            <Alert tone={health.ok ? "ok" : "warn"}>
              {health.mock
                ? "Modo simulado activo (PROVIDER_MOCK=true). Pon PROVIDER_MOCK=false y define la API key para operar en real."
                : health.ok
                  ? "Credencial válida y proveedor respondiendo."
                  : (health.message ?? "El proveedor no responde ahora mismo.")}
            </Alert>
          ) : (
            <Alert tone="danger">
              Falta <code>RECARGAS_AMERICA_API_KEY</code> en el archivo <code>.env</code> del
              servidor. Las compras reales están deshabilitadas.
            </Alert>
          )}
        </div>
      </Card>

      <YapeQrManager src={yapeQrSrc(config)} hasCustomQr={Boolean(config.yapeQrPath)} />

      <SettingsForm
        initial={{
          storeName: config.storeName,
          yapeHolderName: config.yapeHolderName,
          yapePhone: config.yapePhone,
          yapeInstructions: config.yapeInstructions,
          supportWhatsapp: config.supportWhatsapp,
          supportEmail: config.supportEmail,
          socialWhatsappChannel: config.socialWhatsappChannel,
          socialTiktok: config.socialTiktok,
          socialInstagram: config.socialInstagram,
          exchangeRate: config.exchangeRate,
          marginBps: config.marginBps,
          minDepositCents: config.minDepositCents,
          purchasesEnabled: config.purchasesEnabled,
        }}
      />
    </div>
  );
}
