"use client";

import { useState, type FormEvent } from "react";
import { Alert, Badge, Button, Card, Field, Input } from "@/components/ui";
import Link from "next/link";
import { formatPEN } from "@/lib/money";
import type { Comprable, ResultadoConsulta } from "@/server/services/sixoff";

/** Lo que devuelve la ruta: la consulta más qué se puede comprar de ella. */
type Respuesta = ResultadoConsulta & { comprables: Record<string, Comprable> };

/**
 * Consulta de ofertas y paquetes de nivel de una cuenta de Free Fire.
 *
 * Lo que el jugador tiene disponible se cruza con lo que el dueño vende: cada
 * promoción con artículo creado lleva a comprarla CON SALDO de la tienda,
 * igual que los pases y los likes, y entra en su cola de entrega manual. La
 * que no tenga artículo se muestra sin botón, porque enviar a una compra que
 * no existe es peor que no ofrecerla.
 *
 * El ID viaja a la pantalla de compra ya escrito: el comprador acaba de
 * teclearlo aquí y volver a pedírselo es una invitación a equivocarse — que es
 * exactamente lo que costó cuatro pedidos cancelados en setiembre.
 */
export function ConsultaCuenta({ whatsapp }: { whatsapp: string }) {
  const [uid, setUid] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Respuesta | null>(null);

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
      setResultado(json.data as Respuesta);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  /**
   * Un artículo por promoción, con el ID del jugador ya puesto. Si el dueño no
   * ha creado el artículo todavía, no hay botón: se informa y punto.
   */
  function Comprar({ itemId }: { itemId: string }) {
    const c = resultado?.comprables[itemId];
    if (!c) return <Badge tone="neutral">Consúltanos</Badge>;
    return (
      <Link href={`/tienda/${c.productId}?uid=${encodeURIComponent(resultado!.uid)}`}>
        <Button size="sm">Comprar · {formatPEN(c.priceCents)}</Button>
      </Link>
    );
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
                    <Comprar itemId={p.itemId} />
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
                    <Comprar itemId={o.itemId} />
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

          {(resultado.packages.length > 0 || resultado.offers.length > 0) && (
            <p className="text-xs leading-relaxed text-faint">
              Se pagan con tu saldo de la tienda. La entrega es manual: el pedido queda registrado y
              lo activamos a mano, normalmente en pocos minutos en horario de atención.
              {whatsapp ? " Si algo no cuadra, escríbenos por WhatsApp." : ""}
            </p>
          )}

        </div>
      )}
    </div>
  );
}
