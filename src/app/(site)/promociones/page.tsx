import type { Metadata } from "next";
import Link from "next/link";
import { ConsultaCuenta } from "@/components/store/ConsultaCuenta";
import { requireUserPage } from "@/lib/guards";
import { getConfig } from "@/server/services/settings";
import { sixoffConfigurado } from "@/server/services/sixoff";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = {
  title: "Mis promociones",
  description: "Consulta qué ofertas de recarga y paquetes de nivel tiene disponibles tu cuenta.",
};
export const dynamic = "force-dynamic";

/**
 * Consulta de promociones de una cuenta de Free Fire.
 *
 * Pide sesión a propósito: cada consulta descuenta cuota de pago del dueño
 * (ver `api/cuenta-ff/route.ts`). No es una barrera comercial —quien compra ya
 * tiene cuenta— sino lo que impide que alguien recargando en bucle lo deje sin
 * cuota a mitad de mes.
 */
export default async function PromocionesPage() {
  const [, config] = await Promise.all([requireUserPage("/promociones"), getConfig()]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="rise rise-1">
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← Volver al inicio
        </Link>

        <h1 className="mt-3 text-3xl font-black leading-[1.1] tracking-tight sm:text-4xl">
          Tus <span className="text-gradient-flame">promociones</span>
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
          Ingresa tu ID de jugador y te decimos si tu cuenta tiene paquetes de aumento de nivel u
          ofertas de recarga disponibles. Estas promociones dependen de cada cuenta: no todas las
          tienen, y van cambiando.
        </p>
      </div>

      <div className="rise rise-2 mt-8">
        {sixoffConfigurado() ? (
          <ConsultaCuenta whatsapp={config.supportWhatsapp} />
        ) : (
          <EmptyState
            title="La consulta no está disponible"
            description="Estamos terminando de configurarla. Vuelve en un rato o escríbenos por soporte."
          />
        )}
      </div>

      <p className="mt-8 text-xs leading-relaxed text-faint">
        Estas promociones las activamos a mano, no se compran con saldo desde aquí. La consulta solo
        te dice qué tiene disponible tu cuenta.
      </p>
    </div>
  );
}
