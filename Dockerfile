# ─────────────────────────────────────────────────────────────
#  Build multi-etapa. La imagen final no lleva ni el código
#  fuente ni las dependencias de desarrollo.
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Variables ficticias: solo se necesitan para que el build no falle al validar
# el entorno. Las reales llegan en tiempo de ejecución.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Salida standalone: solo lo imprescindible para arrancar.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Migraciones y scripts (para ejecutar db:migrate / db:seed dentro del contenedor).
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/src/db ./scripts/db
COPY --from=builder /app/node_modules ./node_modules_full

# Los comprobantes viven en un volumen, fuera de la imagen.
RUN mkdir -p /app/storage/receipts && chown -R nextjs:nodejs /app/storage

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
