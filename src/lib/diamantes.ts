/**
 * Cuántos diamantes trae un paquete, leídos de su nombre.
 *
 * El ranking del mes cuenta diamantes de Free Fire y nada más. La razón no es
 * técnica: el catálogo mezcla monedas que no valen lo mismo —Oro de Blood
 * Strike, Cajas Evo, pases, membresías— y sumarlas en una sola cifra daría un
 * orden falso, donde 5,800 de Oro le pasan por encima a quien gastó el triple
 * en diamantes. El dueño eligió Free Fire por ser lo que más vende.
 *
 * Se lee del NOMBRE porque es lo único que hay: el catálogo del proveedor no
 * publica la cantidad como dato aparte. En la orden ese nombre es una copia
 * congelada del momento de la compra, así que un cambio de catálogo no
 * reescribe el pasado.
 *
 * Todo lo que no diga "diamantes" vale 0, y el 0 deja a esa persona fuera del
 * ranking en vez de mostrarla con un cero al lado.
 */

/**
 * Captura la cantidad escrita justo antes de la palabra, incluidos los
 * paquetes con bono ("1060 + 106 Diamantes"). Los separadores de miles se
 * limpian después, así que da igual "1.060" que "1,060" que "1060".
 */
const CANTIDAD = /([0-9][0-9.,]*(?:\s*\+\s*[0-9][0-9.,]*)*)\s*(?:diamantes?|diamonds?)\b/i;

export function diamantesDe(productName: string): number {
  const m = CANTIDAD.exec(productName ?? "");
  if (!m) return 0;

  return m[1]
    .split("+")
    .reduce((total, parte) => {
      const n = Number(parte.replace(/[^0-9]/g, ""));
      return Number.isFinite(n) ? total + n : total;
    }, 0);
}

/** Si este pedido cuenta para el ranking de diamantes. */
export function cuentaParaRanking(gameName: string, productName: string): boolean {
  return /free\s*fire/i.test(gameName ?? "") && diamantesDe(productName) > 0;
}
