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
const DOMINIOS_CONOCIDOS = [
  // Primero los que de verdad usa la gente en Perú. El ORDEN IMPORTA: cuando
  // una errata puede corregirse a dos dominios distintos, gana el de más
  // arriba, no el que esté a menos letras.
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
  "hotmail.es",
  "outlook.es",
  "live.com",
  "hotmail.com.pe",
  "outlook.com.pe",
  "yahoo.es",
  "yahoo.com.mx",
  "live.com.mx",
  "googlemail.com",
  "msn.com",
  "me.com",
  "mac.com",
  "aol.com",
  // De aquí para abajo, dominios reales que se parecen peligrosamente a los de
  // arriba. Están para NO corregirlos cuando alguien los escribe bien.
  "ymail.com",
  "rocketmail.com",
  "mail.com",
  "email.com",
  "gmx.com",
  "zoho.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
] as const;

const CONOCIDOS = new Set<string>(DOMINIOS_CONOCIDOS);

/** Máxima diferencia tolerada para proponer un cambio. */
const MAX_DISTANCIA = 2;

/**
 * Por debajo de este largo se exige una diferencia de UNA sola letra, porque
 * un dominio corto se parece a demasiadas cosas.
 *
 * Estuvo en 9 y era pasarse de prudente: dejaba fuera "gma.com" (7 letras, dos
 * de diferencia con gmail.com), que es justo una de las erratas que acabó
 * bloqueando a un comprador real. Los dominios cortos que de verdad existen
 * —gmx, aol, mac, me, mail— ya están en la lista de arriba y nunca llegan
 * hasta aquí.
 */
const LARGO_SEGURO = 7;

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
  if (CONOCIDOS.has(dominio)) return null;

  /*
    Se elige por POPULARIDAD, no por cercanía, y la distancia solo desempata.

    "gma.com" está a una letra de "gmx.com" —un proveedor alemán real— y a dos
    de "gmail.com". Eligiendo el más cercano se le proponía gmx a un comprador
    peruano que obviamente quiso escribir gmail, y la sugerencia no servía de
    nada. Pasó de verdad: esa dirección acabó rebotando y bloqueó la cuenta.
  */
  for (const candidato of DOMINIOS_CONOCIDOS) {
    const d = distancia(dominio, candidato, MAX_DISTANCIA);
    if (d > MAX_DISTANCIA) continue;

    // Un dominio corto se parece a demasiadas cosas: ahí se exige una sola
    // letra de diferencia.
    if (dominio.length < LARGO_SEGURO && d > 1) continue;

    // El primero que encaja gana, y punto. No se sigue buscando uno más
    // cercano: la lista está ordenada por cuánto se usa, y eso pesa más que
    // una letra de diferencia.
    return `${local}@${candidato}`;
  }

  return null;
}
