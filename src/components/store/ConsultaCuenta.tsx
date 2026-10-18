"use client";

import { useState, type FormEvent } from "react";
import { Alert, Badge, Button, Card, Field, Input } from "@/components/ui";
import type { ResultadoConsulta } from "@/server/services/sixoff";

/**
 * Consulta de ofertas y paquetes de nivel de una cuenta de Free Fire.
 *
 * El resultado NO es un botón de compra: estos productos los entrega el dueño
 * a mano con un proveedor aparte. Aquí el comprador averigua qué tiene
 * disponible y con eso escribe por WhatsApp. Por eso la pantalla termina en
 * "escríbenos" y no en "comprar" — prometer un botón que no existe sería peor
 * que no tener la pantalla.
 */
export function ConsultaCuenta({ whatsapp }: { whatsapp: string }) {
  const [uid, setUid] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoConsulta | null>(null);

  async function consultar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    setResultado(null);
    try {
      const res = await fetch("/api/cuenta-ff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: uid.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "No pudimos consultar.");
      setResultado(json.data as ResultadoConsulta);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  const nada =
    resultado && !resultado.levelUpAvailable && resultado.offers.length === 0 && !resultado.faltaNivel;

  return (
    <div className="space-y-5">
      <form onSubmit={consultar} className="space-y-4" noValidate>
        <Field
          label="Tu ID de jugador"
          htmlFor="uid"
          hint="Son solo números. Lo encuentras en tu perfil dentro del juego."
        >
          <Input
            id="uid"
            inputMode="numeric"
            placeholder="1234567890"
            value={uid}
            onChange={(e) => setUid(e.target.value.replace(/[^0-9]/g, ""))}
            maxLength={15}
          />
        </Field>

        <Button type="submit" loading={cargando} disabled={uid.trim().length < 8} fullWidth size="lg">
          Consultar mi cuenta
        </Button>
      </form>

      {error && <Alert>{error}</Alert>}

      {resultado && (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-faint">Cuenta encontrada</p>
              <p className="text-lg font-black">{resultado.nickname ?? `Jugador ${resultado.uid}`}</p>
            </div>
            {resultado.region && <Badge tone="info">Región {resultado.region}</Badge>}
          </Card>

          {/* Una mitad caída no debe esconder la otra: la consulta que sí
              funcionó ya se pagó, así que se muestra igual. */}
          {resultado.faltaNivel && (
            <Alert tone="warn">
              No pudimos consultar los paquetes de nivel en este momento. Vuelve a intentarlo en unos
              minutos.
            </Alert>
          )}
          {resultado.faltaOfertas && (
            <Alert tone="warn">
              No pudimos consultar las ofertas de primera recarga en este momento.
            </Alert>
          )}

          {resultado.packages.length > 0 && (
            <Card className="space-y-3">
              <h2 className="font-bold">Paquetes de aumento de nivel disponibles</h2>
              <ul className="space-y-2">
                {resultado.packages.map((p) => (
                  <li
                    key={p.itemId}
                    className="flex items-center gap-3 rounded-xl border border-line-soft bg-abyss px-4 py-3"
                  >
                    <span className="flex-1 font-semibold">{p.name}</span>
                    <Badge tone="ok">Disponible</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {resultado.offers.length > 0 && (
            <Card className="space-y-3">
              <h2 className="font-bold">Ofertas de recarga disponibles</h2>
              <ul className="space-y-2">
                {resultado.offers.map((o) => (
                  <li
                    key={o.itemId}
                    className="flex items-center gap-3 rounded-xl border border-line-soft bg-abyss px-4 py-3"
                  >
                    <span className="flex-1">
                      <span className="block font-semibold">{o.name}</span>
                      {o.diamonds !== null && (
                        <span className="text-xs text-muted">{o.diamonds} diamantes</span>
                      )}
                    </span>
                    {o.discountPercent !== null && (
                      <Badge tone="ok">-{Math.round(o.discountPercent)}%</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {nada && (
            <Alert tone="warn" title="Esta cuenta no tiene nada disponible ahora">
              Ni paquetes de aumento de nivel ni ofertas de recarga. Estas promociones aparecen y
              desaparecen según la cuenta, así que vuelve a consultar más adelante.
            </Alert>
          )}

          {(resultado.packages.length > 0 || resultado.offers.length > 0) && whatsapp && (
            <Card className="space-y-3 border-flame-500/30">
              <p className="text-sm text-muted">
                Estos productos los activamos a mano. Escríbenos con tu ID y te decimos el precio.
              </p>
              <a
                href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                  `Hola, consulté mi cuenta ${resultado.uid} (${resultado.nickname ?? "sin nombre"}) y me aparecen promociones disponibles. Quisiera más información.`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button fullWidth>Escribir por WhatsApp</Button>
              </a>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
