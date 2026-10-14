#!/usr/bin/env bash
#
# Servidor de salida con IP fija para las llamadas a los proveedores.
#
# ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
# El proveedor de Free Fire permite registrar las IPs desde las que acepta cada
# clave de API. Quien no registre ninguna queda tratado como "conexión
# cualquiera" y su sistema puede bloquearlo solo, sin aviso, con desbloqueo
# únicamente por ticket.
#
# La tienda corre en Vercel y ahí la IP de salida rota. Medido en producción el
# 12/10/2026: tres IPs distintas en diez minutos desde el mismo despliegue y la
# misma región (34.227.13.119, 54.167.104.207, 3.238.238.243). Una clave
# llegando desde decenas de IPs es justo el patrón que un antifraude busca.
#
# Este servidor da esa IP fija. Es lo único que registra el proveedor.
#
# ── POR QUÉ UN PROXY DE CONNECT Y NO UN REENVÍO ──────────────────────────────
# Squid actúa como proxy de reenvío: la tienda le pide "conéctame con el
# proveedor" y a partir de ahí el TLS va de extremo a extremo entre Vercel y el
# proveedor. Este servidor NUNCA ve la clave de API, ni los IDs de jugador, ni
# nada del contenido; solo sabe a qué dominio se está conectando.
#
# Un reenvío que terminara el TLS aquí sí vería la clave en claro, y
# convertiría a esta máquina de cinco dólares en el punto más débil de toda la
# tienda. Por eso no se hace así.
#
# ── CÓMO SE PROTEGE ──────────────────────────────────────────────────────────
# El puerto tiene que estar abierto a internet, porque las IPs de Vercel rotan
# y no hay a quién dejar entrar por origen. Así que el candado es doble:
#
#   1. Usuario y contraseña.
#   2. Lista de destinos permitidos: aunque alguien robe esa contraseña, lo
#      único que puede hacer con este proxy es hablar con los proveedores de
#      recargas. No le sirve para navegar, ni para atacar a nadie, ni para
#      esconder su tráfico.
#
# ── USO ──────────────────────────────────────────────────────────────────────
#   scp instalar.sh root@IP:/root/
#   ssh root@IP 'bash /root/instalar.sh'
#
# Imprime al final la URL que hay que poner en PROVIDER_PROXY_URL en Vercel.
# Es reejecutable: correrlo dos veces no rompe nada, pero genera una
# contraseña nueva.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

USUARIO_PROXY="kryvexa"
PUERTO="${PUERTO:-3128}"

# Los dominios a los que este proxy puede conectarse. El punto inicial incluye
# los subdominios. Si algún día se cambia de proveedor, se añade aquí.
DESTINOS=(".recargasamerica.com" ".epinby.com")

echo "──────────────────────────────────────────────"
echo "  Salida con IP fija para Kryvexa"
echo "──────────────────────────────────────────────"

if [[ $EUID -ne 0 ]]; then
  echo "Hay que ejecutarlo como root (usa: sudo bash $0)" >&2
  exit 1
fi

echo "→ Instalando paquetes"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq squid apache2-utils ufw curl >/dev/null

# ── Credenciales ─────────────────────────────────────────────────────────────
# Se generan aquí y no las elige una persona: una contraseña de proxy escrita a
# mano acaba siendo la misma de siempre.
CLAVE_PROXY="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 32)"

echo "→ Creando el usuario del proxy"
htpasswd -b -c /etc/squid/passwd "$USUARIO_PROXY" "$CLAVE_PROXY" >/dev/null 2>&1
chown proxy:proxy /etc/squid/passwd
chmod 640 /etc/squid/passwd

# ── Configuración ────────────────────────────────────────────────────────────
echo "→ Escribiendo la configuración"

# Ubuntu mueve este binario de sitio según la versión; se busca en vez de
# escribir una ruta fija que un día deje de existir.
IP_INTERFAZ="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)"
if [[ -z "$IP_INTERFAZ" ]]; then
  echo "No se pudo determinar la IP de salida del servidor" >&2
  exit 1
fi

AUTENTICADOR="$(find /usr/lib /usr/libexec -name basic_ncsa_auth -type f 2>/dev/null | head -1)"
if [[ -z "$AUTENTICADOR" ]]; then
  echo "No se encontró basic_ncsa_auth; revisa que el paquete squid esté completo" >&2
  exit 1
fi

{
  echo "# Generado por instalar.sh — no editar a mano."
  echo "http_port ${PUERTO}"
  echo
  echo "auth_param basic program ${AUTENTICADOR} /etc/squid/passwd"
  echo "auth_param basic realm Kryvexa"
  echo "auth_param basic children 5"
  echo "auth_param basic credentialsttl 2 hours"
  echo "acl autenticado proxy_auth REQUIRED"
  echo
  echo "acl destinos dstdomain ${DESTINOS[*]}"
  echo "acl puerto_seguro port 443"
  echo "acl metodo_connect method CONNECT"
  echo
  echo "# Orden importante: primero se niega todo lo que no cumple, y solo al"
  echo "# final se permite lo que cumple las tres condiciones."
  echo "http_access deny !autenticado"
  echo "http_access deny !destinos"
  echo "http_access deny metodo_connect !puerto_seguro"
  echo "http_access allow autenticado destinos"
  echo "http_access deny all"
  echo
  echo "# Son llamadas a una API de compras: guardar una respuesta en caché"
  echo "# podría devolver el resultado de la recarga de otra persona."
  echo "cache deny all"
  echo "cache_store_log none"
  echo
  echo "# Sin esto, cada petición anuncia la IP interna de Vercel y la versión"
  echo "# del proxy al proveedor."
  echo "via off"
  echo "forwarded_for delete"
  echo
  echo "# La IP de salida es el motivo de todo esto. Sin fijarla, un servidor"
  echo "# con IPv6 saldría por una dirección distinta que no está registrada"
  echo "# en el proveedor, y las recargas fallarían de forma intermitente."
  echo "#"
  echo "# Se usa la IP de origen de la ruta por defecto, NO la pública que"
  echo "# devuelve un servicio externo: en servidores detrás de NAT (AWS, GCP)"
  echo "# la pública no está en la interfaz y squid no podría enlazarla."
  echo "dns_v4_first on"
  echo "tcp_outgoing_address ${IP_INTERFAZ}"
} > /etc/squid/squid.conf

echo "→ Abriendo el cortafuegos"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow "${PUERTO}"/tcp >/dev/null
ufw --force enable >/dev/null

echo "→ Arrancando el servicio"
systemctl enable squid >/dev/null 2>&1
systemctl restart squid
sleep 2

if ! systemctl is-active --quiet squid; then
  echo "Squid no arrancó. Revisa: journalctl -u squid -n 40" >&2
  exit 1
fi

IP_PUBLICA="$(curl -4 -s --max-time 10 https://api.ipify.org)"

echo
echo "──────────────────────────────────────────────"
echo "  Listo"
echo "──────────────────────────────────────────────"
echo
echo "IP a registrar en el panel del proveedor:"
echo
echo "    ${IP_PUBLICA}"
echo
echo "Variable PROVIDER_PROXY_URL para Vercel (producción):"
echo
echo "    http://${USUARIO_PROXY}:${CLAVE_PROXY}@${IP_PUBLICA}:${PUERTO}"
echo
echo "Guarda esa línea donde guardas las claves. No vuelve a mostrarse:"
echo "la contraseña solo existe cifrada en /etc/squid/passwd."
echo
