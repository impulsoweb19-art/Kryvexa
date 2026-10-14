# Salida con IP fija hacia los proveedores

## El problema

El proveedor de Free Fire dejó registrar, desde el 15/10/2026, las IPs desde
las que acepta cada clave de API. Quien no registre ninguna no queda cortado,
pero sí tratado como "conexión cualquiera": su sistema puede bloquearlo solo,
con umbrales que no publican, y el desbloqueo es por ticket de soporte.

La tienda corre en Vercel, donde la IP de salida **no es fija**. Medido en
producción el 12/10/2026, mismo despliegue y misma región (`iad1`):

| Hora    | IP de salida     |
| ------- | ---------------- |
| 10:4x   | `34.227.13.119`  |
| 10:5x   | `54.167.104.207` |
| 10:5x   | `3.238.238.243`  |

Tres en diez minutos. Registrarlas no es opción: en un mes serían cientos. Y
una misma clave llegando desde decenas de IPs es exactamente el patrón que un
sistema antifraude está puesto para detectar, así que la tienda no solo no se
beneficia de la lista blanca: queda entre las más sospechosas.

El proveedor confirmó además que **no acepta rangos ni comodines**, y que sí
acepta **varias IPs por clave**.

## La solución

Un servidor pequeño con IP fija por el que salen las llamadas a los
proveedores. Esa IP es la que se registra.

```
Vercel (IP rotatoria) ──► este servidor (IP fija) ──► proveedor
```

### Por qué un proxy de CONNECT y no un reenvío

Squid trabaja como proxy de reenvío: la tienda le pide "conéctame con el
proveedor" y el cifrado va de extremo a extremo entre Vercel y el proveedor.
**Este servidor nunca ve la clave de API ni los datos de los jugadores**; solo
sabe a qué dominio se conecta.

Un reenvío que terminara el TLS aquí sí vería la clave en claro, y convertiría
una máquina de cinco dólares en el punto más débil de la tienda.

### Por qué el puerto está abierto a internet

Porque las IPs de Vercel rotan y no hay a quién permitir por origen — que es
el problema que vinimos a resolver. El candado es doble:

1. Usuario y contraseña generados al azar en la instalación.
2. **Lista de destinos permitidos.** Aunque alguien robe la contraseña, lo
   único que puede hacer con este proxy es hablar con los proveedores de
   recargas. No le sirve para navegar ni para esconder tráfico, y seguiría sin
   tener la clave de API, que viaja cifrada y el proxy no puede leer.

## Montarlo

1. Contrata el servidor más pequeño que haya, con **Ubuntu 24.04** y **IPv4
   fija**, en **Estados Unidos, costa este**. Las funciones de la tienda corren
   en `iad1` (Washington); un servidor al lado añade 1 o 2 ms, uno en Europa
   añadiría unos 150 ms a cada recarga.

2. Instala:

   ```bash
   scp instalar.sh root@IP_DEL_SERVIDOR:/root/
   ssh root@IP_DEL_SERVIDOR 'bash /root/instalar.sh'
   ```

   Al terminar imprime la IP a registrar y la URL completa del proxy. Esa URL
   lleva la contraseña y **no se vuelve a mostrar**.

3. Comprueba **antes** de tocar producción:

   ```bash
   PROVIDER_PROXY_URL='http://...' bash comprobar.sh
   ```

   Las cuatro comprobaciones tienen que pasar.

4. Registra la IP en el panel del proveedor.

5. Añade `PROVIDER_PROXY_URL` en Vercel (entorno de producción) y vuelve a
   desplegar. Sin esa variable el código sale directo, igual que siempre, así
   que este paso es el único que cambia el comportamiento.

6. Haz **una compra real** de las baratas y confirma que se entrega.

## Volver atrás

Borrar `PROVIDER_PROXY_URL` en Vercel y desplegar. La tienda vuelve a salir
directa. Mientras la IP siga registrada en el proveedor no se pierde nada, así
que es una marcha atrás de un minuto y sin riesgo.

## Mantenimiento

- El servidor necesita sus actualizaciones de seguridad como cualquier otro.
- Si se cambia de proveedor, hay que añadir su dominio a `DESTINOS` en
  `instalar.sh` y volver a ejecutarlo (genera una contraseña nueva, así que
  hay que actualizar también la variable en Vercel).
- Si el servidor se cae, las recargas automáticas dejan de funcionar. La
  marcha atrás de arriba las devuelve al instante.
