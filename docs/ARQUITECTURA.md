# Arquitectura — Plataforma de Recargas Free Fire

> Documento previo a la implementación. Responde a los puntos 1–8 del apartado 16 del brief.

---

## 1. Análisis de la documentación de la API (lo que REALMENTE existe)

Endpoints confirmados en la colección Postman (`https://panel.recargasamerica.com/api/v1`, `Authorization: Bearer <key>`):

| Método | Ruta | Uso real en nuestra plataforma |
|---|---|---|
| GET | `/wallet` | Saldo del **revendedor** (nuestro, no del usuario). Solo panel admin. |
| GET | `/products/games` | Catálogo de paquetes de juego. Devuelve `id, game, package, price, input_fields[]`. **Fuente principal de Free Fire.** |
| GET | `/products/pins` | Catálogo PIN/recarga. Devuelve `id, sku, name, type, price`. |
| POST | `/buy/games` | Compra por `package_id` + `input1..N` + `client_name?`. Devuelve `reference`, `status` (`COMPLETED`/`PENDING`). |
| POST | `/buy/pins` | Compra PIN (`product_id`+`quantity`) o recarga (`product_id`+`redemption_id`). Nunca ambos. |
| POST | `/pins/validate` | Precheck de cuenta. **Solo para productos de `/products/pins` con `type=recharge`.** |
| GET | `/orders/{reference}` | Estado de una orden de juego que quedó `PENDING`. |
| POST | `/buy/streaming`, GET `/products/streaming` | Fuera de alcance v1. |

### Vacíos e inconsistencias de la documentación (NO los invento, los abstraigo)

1. **No existe validación de Player ID para `/products/games`.** `/pins/validate` está documentado como exclusivo de productos `type=recharge` de `/products/pins`. Por lo tanto:
   - Si el producto de Free Fire viene por `/products/pins` con `type=recharge` → **sí** se puede validar el ID antes de comprar.
   - Si viene por `/products/games` → **no hay endpoint documentado de validación**. La plataforma marcará el producto como `validationSupported=false`, mostrará una confirmación explícita al usuario ("verifica tu ID, las recargas no son reembolsables") y dejará el hook `validateAccount()` listo para cuando el proveedor confirme si `/pins/validate` acepta `package_id`.
2. **`/products/pins` no documenta `input_fields`** pero sí menciona `type`. El ejemplo de respuesta no incluye `type`; la descripción de `/buy/pins` sí lo exige. Se trata como campo opcional con fallback `"pin"`.
3. **`GET /orders/{reference}` solo está documentado para órdenes de `/buy/games`.** `/buy/pins` no devuelve `reference` en el ejemplo (solo `transaction_id` y `api_data`). Se asume `/buy/pins` es síncrono; si algún día devuelve `reference`, el mapper ya lo soporta.
4. **No hay webhooks.** La conciliación de órdenes `PENDING` será por *polling* (cron interno).
5. **No hay endpoint de idempotencia del proveedor.** No podemos enviar una `Idempotency-Key`. Mitigación: nuestro propio candado + `client_name` con nuestra referencia interna + reconciliación por `reference`.
6. **Moneda de la API: USD.** Nuestra billetera es **PEN** (Yape). Conversión con tipo de cambio + margen configurables desde el panel.
7. **`price` de `/products/games` es el COSTO nuestro**, no el precio de venta. El precio al público lo calcula nuestra plataforma.

---

## 2. Stack tecnológico

| Capa | Elección | Motivo |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript strict** | Front y back en un repo, Server Components para no filtrar secretos al cliente, Route Handlers como API. |
| UI | **Tailwind CSS v4** + componentes propios | Sin plantilla genérica; diseño oscuro gaming a medida. |
| ORM / BD | **Prisma + PostgreSQL 16** | Migraciones versionadas, transacciones serializables, `SELECT ... FOR UPDATE` para la billetera. |
| Auth | Sesión propia: **bcrypt** + cookie `httpOnly/SameSite=Lax/Secure` + tabla `Session` | Revocable al instante (suspender usuario), sin dependencias pesadas. |
| Validación | **Zod** en cliente y servidor (mismo esquema) | Una sola fuente de verdad. |
| Subidas | Disco privado fuera de `/public`, servido por Route Handler con autorización | Los comprobantes NO son públicos. |
| Rate limit | Middleware propio en BD/memoria por IP + usuario | Login, registro, depósitos y compras. |
| Deploy | **Docker + docker-compose** (app + postgres) | Portable a cualquier VPS. |
| Cron | Route Handler `/api/cron/*` protegido con `CRON_SECRET` | Conciliación de órdenes PENDING y refresco de catálogo. |

**Dinero:** todo en **enteros (céntimos)**. `Int` en PostgreSQL. Nunca `float`. PEN para el usuario, USD (céntimos) para el costo del proveedor.

---

## 3. Estructura de carpetas

```
recargas-ff/
├─ docker-compose.yml            # app + postgres
├─ Dockerfile
├─ .env.example                  # NUNCA .env en git
├─ prisma/
│  ├─ schema.prisma
│  └─ seed.ts                    # admin inicial + settings
├─ storage/receipts/             # comprobantes (fuera de /public, gitignored)
└─ src/
   ├─ app/
   │  ├─ (public)/               # home, productos, cómo funciona, soporte
   │  ├─ (auth)/login, /registro
   │  ├─ (app)/                  # zona usuario autenticado
   │  │  ├─ tienda/ · tienda/[id]/ · billetera/ · billetera/recargar/
   │  │  └─ pedidos/ · pedidos/[id]/
   │  ├─ admin/                  # zona admin (dashboard, usuarios, depósitos, pedidos, catálogo, config)
   │  └─ api/
   │     ├─ auth/…  orders/…  deposits/…  catalog/…  validate/…
   │     ├─ receipts/[id]/       # descarga autorizada de comprobantes
   │     └─ cron/reconcile-orders · cron/sync-catalog
   ├─ components/                # UI (ui/, layout/, store/, admin/)
   ├─ lib/                       # db, session, auth, zod, money, rate-limit, logger, errors, audit
   └─ server/
      ├─ providers/
      │  ├─ types.ts             # interfaz ProviderAdapter  ← contrato multi-proveedor
      │  ├─ registry.ts          # resuelve proveedor por código
      │  └─ recargas-america/    # client.ts · service.ts · mapper.ts · mock.ts
      └─ services/               # wallet · deposits · orders · catalog · settings · stats
```

**Regla de oro:** `src/server/**` jamás se importa desde un Client Component. La API key vive solo ahí.

---

## 4. Esquema de base de datos

```
User(id, email✦, passwordHash, name, phone, role[USER|ADMIN], status[ACTIVE|SUSPENDED], …)
 └─1:1─ Wallet(userId✦, balanceCents, pendingCents, currency='PEN', version)
         └─1:N─ WalletTransaction(id, walletId, direction[CREDIT|DEBIT], reason, amountCents,
                                  balanceAfterCents, refType, refId, idempotencyKey✦, createdAt)
User ─1:N─ Session(id, userId, tokenHash✦, expiresAt, ip, userAgent, revokedAt)
User ─1:N─ DepositRequest(id, userId, amountCents, method='YAPE', operationCode,
                          receiptPath, receiptMime, receiptSize, status[PENDING|APPROVED|REJECTED],
                          reviewedById, reviewedAt, rejectionReason, createdAt)
User ─1:N─ Order(id, code✦, userId, productId, providerCode, snapshot(productName, gameName),
                 priceCents(PEN), costUsdCents, inputs(json), playerNickname,
                 status[PENDING|PROCESSING|COMPLETED|FAILED|CANCELLED|REFUNDED],
                 providerReference, providerTxId, resultJson, failureCode, failureMessage,
                 idempotencyKey✦, refundedAt, lastCheckedAt, attempts)
Provider(code✦, name, enabled, baseUrl, notes)
Product(id, providerCode, externalId, kind[GAME_PACKAGE|PIN|RECHARGE], gameName, packageName,
        sku, costUsdCents, priceCents(override|null), marginPercent(override|null),
        inputFields(json), validationSupported, active, visible, sortOrder, lastSyncedAt)
        UNIQUE(providerCode, kind, externalId)
ProviderTransaction(id, orderId?, providerCode, endpoint, method, requestBody(redactado),
                    responseBody(redactado), httpStatus, durationMs, ok, createdAt)
Setting(key✦, valueJson, updatedAt)     # yape.*, pricing.exchangeRate, pricing.marginPercent, store.*
AuditLog(id, actorId, actorEmail, action, entityType, entityId, metaJson, ip, userAgent, createdAt)
```

**Invariante contable:** el saldo **nunca** se escribe directamente. Toda mutación pasa por `walletService.applyTransaction()`, que dentro de la misma transacción SQL bloquea la fila (`FOR UPDATE`), inserta el asiento en `WalletTransaction` y actualiza `Wallet.balanceCents`. `idempotencyKey` es `UNIQUE`: reintentar la misma operación no duplica saldo. Auditoría: `SUM(créditos) - SUM(débitos) == balanceCents` es verificable con un query.

---

## 5. Flujo completo de una compra

```
1. Usuario elige paquete → GET /api/catalog/products (precio PEN ya calculado en servidor)
2. (si validationSupported) POST /api/catalog/validate {productId, accountId}
      → RecargasAmericaService.validateAccount() → POST /pins/validate
      → devuelve {valid, accountName} ; NO descuenta nada
3. Usuario confirma → POST /api/orders
      Headers: Idempotency-Key: <uuid del cliente>
      Body: {productId, inputs:{input1,input2}, priceCents}   ← el precio se RECALCULA en servidor
   ─────────────────── TRANSACCIÓN SQL (Serializable) ───────────────────
   a. rate-limit + Zod + usuario ACTIVE
   b. SELECT … FROM "Wallet" WHERE userId=… FOR UPDATE     ← candado pesimista
   c. si balanceCents < priceCents → 422 INSUFFICIENT_FUNDS (nada cambia)
   d. INSERT Order(status=PROCESSING, idempotencyKey)      ← UNIQUE mata el doble clic
   e. INSERT WalletTransaction(DEBIT, key=`order:{id}:debit`) + UPDATE Wallet
   ──────────────────────── COMMIT ──────────────────────────────────────
4. FUERA de la transacción: providerAdapter.purchase()  (timeout 30 s, sin reintentos ciegos)
5. Mapeo de la respuesta a NUESTROS estados:
      COMPLETED  → Order.COMPLETED, guarda reference/pins
      PENDING    → Order.PENDING  (guarda reference, entra al cron de conciliación)
      error HTTP / success=false / timeout → Order.FAILED
6. Si FAILED → reembolso idempotente: WalletTransaction(CREDIT, key=`order:{id}:refund`)
      → Order.REFUNDED. El usuario nunca pierde saldo por un fallo del proveedor.
7. Si TIMEOUT o red caída → Order.PENDING (NO se reembolsa aún): puede haberse ejecutado.
      El cron consulta GET /orders/{reference}; si tras N intentos sigue sin resolverse,
      queda para revisión manual del admin (nunca se adivina).
8. AuditLog + ProviderTransaction (con la API key redactada) en todos los casos.
```

Cron `/api/cron/reconcile-orders` (cada 2 min): toma órdenes `PENDING` con `reference`, consulta `GET /orders/{reference}`, y las cierra como `COMPLETED` o `REFUNDED`.

**Nunca** se asume éxito por un HTTP 200: se exige `success === true` **y** `data.status` esperado.

---

## 6. Protección de la API key

- Vive **solo** en `RECARGAS_AMERICA_API_KEY` del `.env` del servidor. `.env` está en `.gitignore`; se versiona `.env.example` con placeholders.
- Solo la lee `src/server/providers/recargas-america/client.ts`, que se ejecuta en Node runtime. Ese módulo importa `import "server-only"`, de modo que **el build falla** si alguien lo importa desde un Client Component. Es una barrera de compilación, no una convención.
- El navegador nunca llama a `panel.recargasamerica.com`. Todas las llamadas salen del servidor; el cliente solo habla con nuestras rutas `/api/*`.
- Ninguna variable con la key lleva prefijo `NEXT_PUBLIC_`.
- Los logs (`ProviderTransaction`) pasan por un `redact()` que borra `authorization`, `api_key`, `password`, `token`.
- Los errores del proveedor se traducen a mensajes genéricos para el usuario; el detalle técnico solo va al log del servidor.

---

## 7. Riesgos técnicos identificados

| Riesgo | Mitigación implementada |
|---|---|
| Doble clic / reenvío → doble compra | `Idempotency-Key` con índice `UNIQUE` en `Order` + botón deshabilitado + candado de fila. |
| Doble aprobación del mismo comprobante | Transición de estado condicional (`UPDATE … WHERE status='PENDING'`) + `idempotencyKey` `deposit:{id}:credit`. |
| Timeout de la API tras haber cobrado | Orden en `PENDING` (nunca `FAILED` a ciegas) + conciliación por `reference`. |
| Precio manipulado desde el cliente | El servidor **recalcula** el precio desde `Product`; el precio del body solo se compara y si difiere → `PRICE_CHANGED`. |
| Deriva del tipo de cambio | El precio se congela en `Order.priceCents` al crear la orden. |
| Free Fire sin validación de ID (ver §1.1) | Confirmación explícita + `validationSupported` por producto + hook listo. |
| Saldo insuficiente en la billetera del *revendedor* | Widget de saldo `/wallet` en el dashboard admin + alerta bajo umbral configurable. |
| Comprobantes con datos personales | Fuera de `/public`, nombre aleatorio, servidos por ruta autenticada (dueño o admin), validación MIME real por *magic bytes* + límite de 5 MB. |
| Escalado del catálogo (rate limits) | Caché en tabla `Product` + sync por cron, no en cada visita. |
| Segundo proveedor futuro | Interfaz `ProviderAdapter`; `Order` y `Product` ya llevan `providerCode`. Añadir proveedor = 1 carpeta nueva + 1 línea en el registry. |
| Enumeración de cuentas / fuerza bruta | Rate limit por IP+email, respuestas de login genéricas, `bcrypt` cost 12. |

---

## 8. Fuera de alcance de la v1 (deliberadamente)

Automatización de Yape, segundo proveedor, cupones, referidos, notificaciones push, multi-idioma, streaming. La arquitectura los admite sin refactor, pero no se implementan ahora.
