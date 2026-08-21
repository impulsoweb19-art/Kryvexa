import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card } from "@/components/ui";
import { DepositForm } from "@/components/wallet/DepositForm";
import { requireUserPage } from "@/lib/guards";
import { getConfig, yapeQrSrc } from "@/server/services/settings";

export const metadata: Metadata = { title: "Agregar saldo" };
export const dynamic = "force-dynamic";

export default async function TopUpPage() {
  await requireUserPage("/billetera/recargar");
  const config = await getConfig();
  const yapeReady = Boolean(config.yapeHolderName && config.yapePhone);
  const qrSrc = yapeQrSrc(config);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/billetera" className="text-sm text-muted hover:text-ink">
        ← Volver a mi billetera
      </Link>

      <h1 className="mt-6 text-2xl font-bold sm:text-3xl">Agregar saldo por Yape</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Yapea el monto exacto, sube tu comprobante y lo revisamos. La acreditación es manual: no es
        automática todavía.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        {/* Instrucciones de pago */}
        <Card className="rise rise-1 h-fit">
          <h2 className="text-lg font-bold">1. Realiza el pago</h2>

          {!yapeReady ? (
            <Alert tone="warn" title="Datos de pago no configurados">
              El administrador aún no ha publicado los datos de Yape. Escríbenos por soporte antes de
              enviar dinero.
            </Alert>
          ) : (
            <>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="rounded-xl border border-line bg-abyss p-4">
                  <dt className="text-xs text-faint">Titular</dt>
                  <dd className="mt-0.5 font-semibold">{config.yapeHolderName}</dd>
                </div>
                <div className="rounded-xl border border-line bg-abyss p-4">
                  <dt className="text-xs text-faint">Número Yape</dt>
                  <dd className="mt-0.5 font-mono text-lg font-bold tracking-wide text-flame-400">
                    {config.yapePhone}
                  </dd>
                </div>

                {/*
                  QR para pagar escaneando, debajo del número. Se muestra a
                  tamaño contenido y centrado: en el móvil el usuario abre Yape
                  en el mismo teléfono, así que el número de arriba sigue siendo
                  la vía principal; el QR es la alternativa cómoda cuando ve la
                  página en la computadora.
                */}
                <div className="rounded-xl border border-line bg-abyss p-4">
                  <dt className="text-xs text-faint">O escanea el QR</dt>
                  <dd className="mt-3 flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrSrc}
                      alt={`Código QR de Yape de ${config.yapeHolderName}`}
                      width={240}
                      height={257}
                      // h-auto deja que la altura la marque la proporción real
                      // de la imagen: si el administrador sube un QR de otra
                      // forma, no se deforma.
                      className="h-auto w-full max-w-[240px] rounded-lg bg-white"
                    />
                  </dd>
                </div>
              </dl>

              {config.yapeInstructions && (
                <p className="mt-4 text-sm leading-relaxed text-muted">{config.yapeInstructions}</p>
              )}

              <ol className="mt-5 space-y-2 border-t border-line-soft pt-4 text-sm text-muted">
                <li>1. Abre Yape y envía el monto exacto al número indicado.</li>
                <li>2. Toma captura de la constancia de pago.</li>
                <li>3. Complétala en el formulario y envíala.</li>
              </ol>
            </>
          )}
        </Card>

        {/* Formulario */}
        <Card className="rise rise-2">
          <h2 className="mb-5 text-lg font-bold">2. Envía tu comprobante</h2>
          <DepositForm minDepositCents={config.minDepositCents} />
        </Card>
      </div>
    </div>
  );
}
