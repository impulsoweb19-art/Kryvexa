/**
 * Sugerencia de corrección para correos con una errata en el dominio.
 *
 * Nace de un caso real: un comprador se registró con "@gmil.com", olvidó la
 * contraseña y el código de recuperación se fue a un buzón inexistente. Se
 * quedó sin cuenta y sin saldo, y el panel no permite corregir un correo, así
 * que no había forma de rescatarlo.
 *
 * La respuesta intuitiva —obligar a que todos los correos terminen en
 * "@gmail.com"— hace más daño que bien: aquí mucha gente usa hotmail y
 * outlook, y además no arregla el caso, porque "gmail.con" pasaría el filtro
 * igual. Esto en cambio no bloquea a nadie: propone y el usuario decide.
 *
 * Que sea solo una sugerencia es lo que permite ser agresivo al comparar. Un
 * falso positivo cuesta un aviso que se ignora; un falso negativo cuesta una
 * cuenta perdida.
 */

/**
 * Dominios que NO se corrigen. Están los habituales, y también algunos que se
 * parecen peligrosamente a ellos y son reales: "ymail.com" y "mail.com" están
 * a una sola letra de "gmail.com", y sin esta lista se los corregiría mal.
 */
const DOMINIOS_CONOCIDOS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.es",
  "hotmail.com.pe",
  "outlook.com",
  "outlook.es",
  "outlook.com.pe",
  "live.com",
  "live.com.mx",
  "msn.com",
  "yahoo.com",
  "yahoo.es",
  "yahoo.com.mx",
  "ymail.com",
  "rocketmail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "mail.com",
  "email.com",
  "gmx.com",
  "zoho.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
]);

/** Máxima diferencia tolerada para proponer un cambio. */
const MAX_DISTANCIA = 2;

/**
 * Un dominio corto se parece a demasiadas cosas ("live.com" y "mail.com"
 * distan 2). A partir de aquí se exige una diferencia de una sola letra.
 */
const LARGO_SEGURO = 9;

/**
 * Distancia de edición con corte temprano: en cuanto toda una fila supera el
 * máximo, no hay forma de bajar de ahí y se abandona.
 */
function distancia(a: string, b: string, maximo: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maximo) return maximo + 1;

  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const actual = [i];
    let minimoFila = i;

    for (let j = 1; j <= b.length; j += 1) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      const valor = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + coste);
      actual.push(valor);
      if (valor < minimoFila) minimoFila = valor;
    }

    if (minimoFila > maximo) return maximo + 1;
    previa = actual;
  }

  return previa[b.length];
}

/**
 * Devuelve el correo corregido, o null si no hay nada que sugerir.
 *
 * Null significa las tres cosas a la vez: el correo está bien, está a medio
 * escribir, o el dominio no se parece a ninguno conocido (un correo de
 * empresa, por ejemplo). En los tres casos hay que dejar al usuario en paz.
 */
export function sugerirCorreo(email: string): string | null {
  const limpio = email.trim().toLowerCase();
  const arroba = limpio.lastIndexOf("@");

  // Sin parte local, sin dominio, o con espacios: todavía no hay nada que
  // comparar. Que lo termine de escribir.
  if (arroba <= 0 || arroba === limpio.length - 1) return null;
  if (/\s/.test(limpio)) return null;

  const local = limpio.slice(0, arroba);
  const dominio = limpio.slice(arroba + 1);

  // Sin punto aún no es un dominio; avisar aquí sería interrumpir a alguien
  // que va por la mitad.
  if (!dominio.includes(".")) return null;
  if (DOMINIOS_CONOCIDOS.has(dominio)) return null;

  let mejor: string | null = null;
  let mejorDistancia = MAX_DISTANCIA + 1;

  for (const candidato of DOMINIOS_CONOCIDOS) {
    const d = distancia(dominio, candidato, MAX_DISTANCIA);
    if (d < mejorDistancia) {
      mejorDistancia = d;
      mejor = candidato;
    }
  }

  if (!mejor || mejorDistancia > MAX_DISTANCIA) return null;
  if (dominio.length < LARGO_SEGURO && mejorDistancia > 1) return null;

  return `${local}@${mejor}`;
}
