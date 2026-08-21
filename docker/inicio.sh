#!/bin/sh
# Arranque para verlo en local: prepara la base de datos y levanta la app.
# docker-compose.dev.yml ya espera a que PostgreSQL esté sano antes de
# ejecutar esto, así que aquí solo queda preparar el esquema.
set -e

echo ""
echo "──────────────────────────────────────────────"
echo "  Preparando la base de datos…"
echo "──────────────────────────────────────────────"
npm run db:migrate

echo ""
echo "  Creando el administrador y el catálogo de ejemplo…"
npm run db:seed

echo ""
echo "──────────────────────────────────────────────"
echo "  Listo. Abre:  http://localhost:3000"
echo ""
echo "  Panel de administración:  http://localhost:3000/admin"
echo "     usuario:    ${SEED_ADMIN_EMAIL}"
echo "     contraseña: ${SEED_ADMIN_PASSWORD}"
echo "──────────────────────────────────────────────"
echo ""

exec npx next dev -H 0.0.0.0 -p 3000
