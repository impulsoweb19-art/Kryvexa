#!/usr/bin/env bash
#
# Comprueba el servidor de salida ANTES de tocar producción.
#
#   PROVIDER_PROXY_URL='http://usuario:clave@IP:3128' bash comprobar.sh
#
# Las cuatro comprobaciones son las cuatro formas en que esto puede estar mal:
# que deje entrar sin credenciales, que sirva para conectarse a cualquier
# sitio, que el proveedor no conteste por él, y que el segundo proveedor
# quedara fuera de la lista de destinos.
#
# Se lee `%{http_connect}` y no `%{http_code}`: el primero es la respuesta DEL
# PROXY a la petición CONNECT, que es justo lo que se está probando. Con
# `%{http_code}` una negativa del proxy sale como 000 y no se distingue de un
# servidor caído.
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

PROXY="${PROVIDER_PROXY_URL:-}"
if [[ -z "$PROXY" ]]; then
  echo "Falta PROVIDER_PROXY_URL." >&2
  exit 1
fi

# La misma URL sin usuario ni contraseña, para comprobar que de verdad hacen falta.
SIN_CLAVE="$(printf '%s' "$PROXY" | sed -E 's#//[^@]*@#//#')"

RECARGAS="https://panel.recargasamerica.com/api/v1/wallet"
EPINBY="https://epinby.com/api/v1/getMe"
fallos=0

# Devuelve "<respuesta del proxy al CONNECT>|<respuesta del servidor final>".
sondear() {
  curl -s -o /dev/null --max-time 25 -w '%{http_connect}|%{http_code}' \
    --proxy "$1" "$2" 2>/dev/null || true
}

evaluar() {
  local titulo="$1" ok="$2" detalle="$3"
  if [[ "$ok" == "si" ]]; then
    printf '  OK     %-44s %s\n' "$titulo" "$detalle"
  else
    printf '  FALLA  %-44s %s\n' "$titulo" "$detalle"
    fallos=$((fallos + 1))
  fi
}

echo "Comprobando el servidor de salida"
echo

# 1) Sin credenciales tiene que pedirlas. 407 = "identifícate".
conectar="$(sondear "$SIN_CLAVE" "$RECARGAS")"; conectar="${conectar%%|*}"
[[ "$conectar" == "407" ]] && r=si || r=no
evaluar "exige usuario y contraseña" "$r" "CONNECT → ${conectar:-sin respuesta}"

# 2) Con credenciales pero a un destino ajeno: tiene que negarse. Si esto
#    pasara, el proxy serviría para navegar y sería un problema de seguridad.
conectar="$(sondear "$PROXY" "https://example.com")"; conectar="${conectar%%|*}"
[[ "$conectar" != "200" ]] && r=si || r=no
evaluar "bloquea destinos ajenos a los proveedores" "$r" "CONNECT → ${conectar:-denegado}"

# 3) y 4) Los proveedores contestan por el proxy. Lo que importa es que el
#    CONNECT devuelva 200: a partir de ahí respondió el proveedor, y un 401 o
#    un 403 están bien, porque aquí no se manda ninguna clave.
for par in "recargasamerica|$RECARGAS" "epinby|$EPINBY"; do
  nombre="${par%%|*}"; url="${par#*|}"
  salida="$(sondear "$PROXY" "$url")"
  conectar="${salida%%|*}"; final="${salida##*|}"
  [[ "$conectar" == "200" ]] && r=si || r=no
  evaluar "$nombre responde por el proxy" "$r" "CONNECT → ${conectar:-sin respuesta}, servidor → ${final}"
done

echo
if [[ $fallos -eq 0 ]]; then
  echo "Todo correcto. Ya se puede poner PROVIDER_PROXY_URL en Vercel."
else
  echo "$fallos comprobación(es) fallaron. NO lo pongas en producción todavía."
  exit 1
fi
