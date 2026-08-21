# Plataforma de recargas — Free Fire (v1)

Aplicación web completa: registro y login, billetera interna en soles, depósitos por Yape con
aprobación manual, catálogo dinámico desde la API de RecargasAmérica, compra con entrega
automática, panel administrativo y conciliación de órdenes pendientes.

- **Stack:** Next.js 15 (App Router) · TypeScript estricto · Tailwind v4 · Drizzle ORM · PostgreSQL 16 · Docker
- **Documentación de diseño:** [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)
- **Alcance v1:** solo Free Fire, un proveedor. La arquitectura admite un segundo proveedor sin refactor.

---

## 0. ¿Solo quieres verla funcionar?

**Sin Docker** (solo necesita Node.js; usa un PostgreSQL portátil dentro de la carpeta, así
que no requiere virtualización ni permisos de administrador):

```bash
npm install
npm run demo
```

**Con Docker** (requiere virtualización activada):

```bash
docker compose -f docker-compose.dev.yml up
```

Cualquiera de los dos levanta la base de datos, aplica el esquema, crea el administrador y
carga un catálogo de ejemplo. Luego abre **http://localhost:3000** — panel en `/admin` con
`admin@demo.local` / `Demo12345`. Guía paso a paso: [`INICIO-RAPIDO.md`](INICIO-RAPIDO.md).

> Ambos son solo para tu máquina: sus secretos están a la vista. Para producción se usa
> `docker-compose.yml`, que lee todo desde tu `.env`.

---

## 1. Puesta en marcha en local (desarrollo)

Requisitos: Node 22+ y PostgreSQL 16 (o Docker).

```bash
# 1. Dependencias
npm install

# 2. Configuración
cp .env.example .env
#    Genera los secretos y pégalos en .env:
openssl rand -base64 48   # → SESSION_SECRET
openssl rand -base64 24   # → CRON_SECRET

# 3. Base de datos (con Docker, solo Postgres)
docker compose up -d db

# 4. Esquema + datos iniciales
npm run db:migrate
npm run db:seed        # crea el admin con SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD

# 5. Arrancar
npm run dev            # http://localhost:3000
```

Entra en `/admin` con el usuario del seed → **Catálogo → Sincronizar ahora** para traer los
productos, y **Configuración** para poner tus datos de Yape.

### Sin la API key todavía

Con `PROVIDER_MOCK="true"` (valor por defecto de `.env.example`) la aplicación no llama a la API
real: usa datos de ejemplo con **exactamente las mismas formas** que la documentación oficial. Puedes
recorrer el flujo completo —catálogo, validación, compra, órdenes pendientes, conciliación— sin
gastar saldo del proveedor.

Convenciones del modo simulado, útiles para probar:

| Entrada | Resultado |
|---|---|
| Player ID que termina en `0` | la orden queda `PENDING` y se completa a los 30 s (prueba la conciliación) |
| Player ID que empieza por `9` | la validación devuelve "cuenta no encontrada" |
| Cualquier otro | compra `COMPLETED` inmediata |

Cuando tengas la key: `RECARGAS_AMERICA_API_KEY=...` y `PROVIDER_MOCK="false"`. Nada más cambia.

---

## 2. Despliegue en un VPS

```bash
git clone <tu-repo> && cd recargas-ff
cp .env.example .env      # rellena TODOS los valores, PROVIDER_MOCK="false"

docker compose up -d --build
docker compose exec app node scripts/db/migrate.js   # o: npm run db:migrate desde el host
```

`docker-compose.yml` levanta cuatro servicios:

| Servicio | Función |
|---|---|
| `db` | PostgreSQL 16. **Sin puerto publicado**: solo accesible desde la red interna. |
| `app` | Next.js, publicado en `127.0.0.1:3000`. Pon Nginx/Caddy delante con HTTPS. |
| `cron` | Golpea `/api/cron/reconcile-orders` cada 2 min (órdenes pendientes). |
| `cron-catalog` | Golpea `/api/cron/sync-catalog` cada 30 min. |

Los comprobantes viven en el volumen `receipts`, fuera de la imagen y fuera de `/public`.

> **HTTPS es obligatorio en producción.** Las cookies de sesión se emiten con `Secure` cuando
> `NODE_ENV=production`; sin TLS el navegador las descartará y nadie podrá iniciar sesión.

---

## 3. Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Compilación y arranque de producción |
| `npm run typecheck` | TypeScript en modo estricto, sin emitir |
| `npm test` | Batería de pruebas (necesita PostgreSQL en `DATABASE_URL`) |
| `npm run db:generate` | Genera el SQL de migración tras editar `src/db/schema.ts` |
| `npm run db:migrate` | Aplica las migraciones |
| `npm run db:seed` | Admin + proveedor + configuración por defecto |
| `npm run db:studio` | Explorador visual de la base de datos |

---

## 4. Estructura

```
src/
├─ app/
│  ├─ (site)/          web pública + zona de usuario (tienda, billetera, pedidos)
│  ├─ admin/           panel protegido
│  └─ api/             route handlers (auth, orders, deposits, receipts, admin, cron)
├─ components/         UI (ui/, layout/, store/, wallet/, admin/, brand/, auth/)
├─ db/                 schema.ts (Drizzle) · migrate.ts · seed.ts
├─ lib/                env · session · password · money · validation · rate-limit · errors · api
└─ server/
   ├─ providers/       types.ts (contrato) · registry.ts · recargas-america/
   └─ services/        wallet · orders · deposits · catalog · settings · auth · stats · audit · storage
```

---

## 5. Decisiones que conviene conocer antes de tocar el código

### La API key nunca sale del servidor

Vive solo en `RECARGAS_AMERICA_API_KEY`. El único módulo que la lee es
`src/server/providers/recargas-america/client.ts`, que empieza con `import "server-only"`: si alguien
lo importara desde un componente de cliente, **el build falla**. Es una barrera del compilador, no un
acuerdo entre desarrolladores. El navegador nunca habla con `panel.recargasamerica.com`.

### El dinero se guarda en enteros

Todos los importes son céntimos (`Int`). Nunca `float`. `*Cents` = soles, `*UsdCents` = dólares.

### El saldo no se toca sin dejar asiento

`walletService.applyTransaction()` es el único camino que escribe `balance_cents`, y lo hace en la
misma transacción SQL que inserta la fila en `wallet_transactions`. La invariante
`SUM(créditos) − SUM(débitos) = balance_cents` está comprobada en las pruebas.

### La idempotencia es la que protege, no el botón deshabilitado

Cada movimiento de dinero lleva una clave con índice `UNIQUE`:

| Operación | Clave |
|---|---|
| Cobro de una compra | `order:{id}:payment` |
| Devolución | `order:{id}:refund` |
| Abono de un depósito | `deposit:{id}:credit` |
| Alta de la orden | `idempotencyKey` (UUID que genera el navegador) |

Reintentar, refrescar o hacer doble clic devuelve el resultado anterior en lugar de duplicar nada.

### Un HTTP 200 no es una entrega

Solo se da una orden por completada si `success === true` **y** el `status` mapea a `COMPLETED`.
Cualquier estado que no reconozcamos cae en `UNKNOWN` y la orden queda pendiente de verificación.

### Un timeout no se reembolsa a ciegas

Si el proveedor no responde, **no sabemos** si la recarga se ejecutó. La orden queda `PENDING` y el
cron la resuelve consultando `GET /orders/{reference}`. Tras 12 intentos sin veredicto pasa a
`NEEDS_REVIEW` y la cierra una persona desde el panel. Reembolsar automáticamente algo que quizá se
entregó sería regalar dinero.

### Free Fire y la validación del ID (importante)

La documentación solo define `POST /pins/validate` para productos de `/products/pins` con
`type=recharge`. **Para los paquetes de `/products/games` no existe validación documentada.** La
plataforma:

- marca cada producto con `validationSupported`;
- ofrece el botón «Verificar ID» solo donde el proveedor realmente lo soporta;
- donde no, exige una confirmación explícita del usuario en lugar de fingir una comprobación.

Si RecargasAmérica confirma que `/pins/validate` acepta también `package_id`, basta con cambiar
`validationSupported` en `mapper.ts`: el resto ya está preparado.

---

## 6. Seguridad implementada

| Vector | Medida |
|---|---|
| Contraseñas | bcrypt coste 12; límite de 72 caracteres (el real de bcrypt) |
| Sesiones | Token opaco de 256 bits en cookie `httpOnly` + `SameSite=Lax` + `Secure`; en la base solo su HMAC-SHA256; revocables al instante |
| Suspensión de cuenta | Revoca todas las sesiones del usuario en el acto |
| CSRF | `SameSite=Lax` + verificación de `Origin` en todos los POST/PATCH/PUT |
| XSS | React escapa por defecto; CSP restrictiva; sin `dangerouslySetInnerHTML` |
| Inyección SQL | Drizzle parametriza todo, incluidas las plantillas `sql` |
| Fuerza bruta | Rate limit persistente en PostgreSQL, por IP **y** por correo |
| Enumeración de cuentas | Respuestas idénticas y verificación falsa de contraseña para igualar tiempos |
| Subidas | Tipo verificado por *magic bytes*, no por extensión ni MIME declarado; máximo 5 MB; nombre aleatorio |
| Comprobantes | Fuera de `/public`; servidos por ruta autenticada (dueño o admin); `no-store` + `nosniff` |
| Path traversal | La ruta resuelta debe quedar dentro de `RECEIPTS_DIR` |
| Endpoints de admin | Rol verificado en el layout **y** en cada handler por separado |
| Cron | Secreto comparado en tiempo constante |
| Fugas por logs | Redactor que borra `authorization`, `api_key`, `password`, `token`, `cookie` |
| Fugas por errores | El usuario ve un mensaje del catálogo `AppError`; el detalle solo va a stdout |
| Cabeceras | CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` |

---

## 7. Pruebas

`npm test` — 38 casos sobre PostgreSQL real (no simulado: lo que se comprueba son bloqueos de fila,
índices `UNIQUE` y transacciones, cosa que un doble en memoria no reproduce).

Cubren, entre otros:

- el mismo comprobante no acredita saldo dos veces, ni con dos administradores simultáneos;
- cinco débitos concurrentes sobre S/ 10.00 con importe S/ 4.00 → exactamente dos prosperan;
- el doble clic con la misma clave crea una sola orden y un solo cobro;
- un precio manipulado desde el cliente se rechaza con `PRICE_CHANGED`;
- faltan o sobran `input_fields` → la compra no llega al proveedor;
- el reembolso es idempotente aunque se invoque tres veces;
- un estado desconocido del proveedor jamás se interpreta como entrega;
- un archivo que miente sobre su tipo se rechaza.

---

## 8. Qué falta para producción

1. **Poner la API key real** y `PROVIDER_MOCK="false"`.
2. **Cambiar la contraseña del admin** del seed.
3. **TLS** delante de la app (Nginx/Caddy) — sin esto no hay sesiones.
4. **Copias de seguridad** de la base y del volumen de comprobantes.
5. Rellenar los datos de Yape y de soporte en **Configuración**.
6. Revisar tipo de cambio y margen antes de abrir al público.
7. Considerar notificaciones al usuario (correo/WhatsApp) cuando se apruebe un depósito: hoy tiene que
   entrar a mirar.
