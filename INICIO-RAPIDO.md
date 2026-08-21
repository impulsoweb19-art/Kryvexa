# Cómo abrirla y verla funcionando

## Antes de nada: esto no es un `index.html`

Una landing page es un archivo que abres con doble clic y ya. Esto no lo es.

La plataforma tiene cuentas de usuario, saldos, comprobantes de pago y compras contra una API
externa. Todo eso vive en una **base de datos** y necesita un **servidor encendido**. El
navegador por sí solo no puede ejecutarlo.

Hay dos formas de levantarlo. Empieza por la primera.

---

# Opción A — Sin Docker (recomendada)

Solo necesitas **Node.js**. La base de datos viene incluida en el propio proyecto: se descarga
una versión portátil de PostgreSQL dentro de la carpeta, no se instala nada en el sistema, no
toca el registro de Windows y no pide permisos de administrador.

**Esta opción no necesita virtualización**, así que funciona aunque Docker Desktop te dé el
error de *«Virtualization support not detected»*.

### 1. Instala Node.js

Descarga la versión **LTS** de **https://nodejs.org** y ejecuta el instalador.
Siguiente → Siguiente → Instalar. No hay nada que configurar.

### 2. Descomprime el proyecto

Clic derecho sobre `recargas-ff.zip` → **Extraer todo**.
Te queda una carpeta llamada `recargas-ff`.

> Sácala de la carpeta *Descargas* y ponla en un sitio sencillo, por ejemplo `C:\proyectos\`.
> Windows a veces bloquea la ejecución de programas dentro de Descargas.

### 3. Abre una terminal dentro de esa carpeta

- **Windows:** entra a la carpeta, clic derecho en un espacio vacío → *Abrir en Terminal*.
- **Mac:** clic derecho sobre la carpeta → *Servicios* → *Nueva terminal en la carpeta*.

### 4. Escribe estos dos comandos, uno detrás de otro

```bash
npm install
```

```bash
npm run demo
```

La primera vez tarda varios minutos: está descargando las librerías y la base de datos
portátil (unos 100 MB). Las siguientes veces arranca en segundos y **solo necesitas
`npm run demo`**.

> **¿Windows te dice que `npm.ps1` no se puede cargar porque «la ejecución de scripts está
> deshabilitada»?** No es un error del proyecto: es una protección de Windows que por defecto
> bloquea cualquier terminal de PowerShell para correr scripts (incluido el propio de npm).
> Dos formas de arreglarlo, ninguna necesita ser administrador — mira la sección
> [«`npm.ps1` no se puede cargar»](#npmps1-no-se-puede-cargar-ejecución-de-scripts-deshabilitada)
> más abajo.

Cuando veas esto, ya está funcionando:

```
──────────────────────────────────────────────────────
  Listo — abre  http://localhost:3000
──────────────────────────────────────────────────────
```

### 5. Abre http://localhost:3000 en tu navegador

| | |
|---|---|
| **Panel de administración** | http://localhost:3000/admin |
| **Usuario** | `admin@demo.local` |
| **Contraseña** | `Demo12345` |

**Para apagarlo todo:** vuelve a la terminal y pulsa `Ctrl + C`. Se apagan la aplicación y la
base de datos juntas.

Tus datos de prueba se guardan en la carpeta `.postgres-demo/`. Si quieres empezar de cero,
bórrala y vuelve a ejecutar `npm run demo`.

---

# Opción B — Con Docker

Un solo comando, pero **necesita que la virtualización esté activada** en tu equipo.

```bash
docker compose -f docker-compose.dev.yml up
```

## Si Docker dice «Virtualization support not detected»

Es la BIOS del equipo, no el proyecto. Puedes ignorarlo y usar la **Opción A**, o arreglarlo:

**1. Activa la virtualización en la BIOS**

Reinicia y entra a la BIOS pulsando repetidamente `F2`, `F10`, `Supr` o `Esc` según la marca
(la pantalla de arranque suele indicarlo). Busca en las pestañas *Advanced*, *CPU
Configuration* o *Security* una opción llamada:

- **Intel Virtualization Technology** / **Intel VT-x** (procesadores Intel)
- **SVM Mode** / **AMD-V** (procesadores AMD)

Ponla en **Enabled**, guarda con `F10` y reinicia.

**2. Activa las funciones de Windows**

Abre PowerShell **como administrador** y ejecuta:

```powershell
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
wsl --install
```

Reinicia el equipo y vuelve a abrir Docker Desktop.

> Si es un equipo de la empresa, es posible que la BIOS esté bloqueada por política y no
> puedas cambiarlo. En ese caso usa la Opción A, que no lo necesita.

---

## Qué puedes probar una vez dentro

Arranca en **modo simulado**: no necesita la API key de RecargasAmérica y no gasta saldo
real. El catálogo ya viene con los paquetes de Free Fire de ejemplo.

Un recorrido completo:

1. **Regístrate** con cualquier correo (no se envían correos, todo es local).
2. Ve a **Billetera → Agregar saldo**. Elige un monto y sube cualquier imagen como
   comprobante.
3. Abre el **panel** en otra pestaña, entra a **Depósitos** y **aprueba** la solicitud. El
   saldo se acredita al instante.
4. Vuelve a la tienda, elige un paquete y **compra**.

Trucos del modo simulado para ver los casos difíciles:

| Prueba esto | Qué pasa |
|---|---|
| Player ID normal, ej. `123456789` | La compra se completa al instante |
| Player ID terminado en **`0`**, ej. `12345678`**`0`** | La orden queda **«en proceso»**, como cuando el proveedor tarda |
| Aprobar dos veces el mismo depósito | El segundo intento se rechaza: el saldo no se duplica |
| Doble clic rápido en «Confirmar compra» | Se crea **una sola** orden y **un solo** cobro |

---

## Problemas frecuentes

| Mensaje | Qué significa y qué hacer |
|---|---|
| `npm no se reconoce como un comando` | Node.js no está instalado, o no cerraste y volviste a abrir la terminal después de instalarlo. |
| `npm.ps1 no se puede cargar... ejecución de scripts deshabilitada` | Ver la sección siguiente. |
| `EADDRINUSE ... :3000` | Ya tienes algo usando el puerto 3000. Cierra la otra terminal donde quedó corriendo. |
| Se queda parado en «Descargando PostgreSQL portátil» | Sigue descargando (unos 100 MB). Dale unos minutos. |
| Windows pregunta por el Firewall | Es Node pidiendo abrir el puerto local. Permite el acceso en redes privadas. |
| Quiero empezar de cero | Borra la carpeta `.postgres-demo/` y ejecuta `npm run demo` otra vez. |

---

## `npm.ps1` no se puede cargar («ejecución de scripts deshabilitada»)

Si al escribir `npm install` o `npm run demo` en **PowerShell** ves algo como esto:

```
npm : No se puede cargar el archivo C:\Program Files\nodejs\npm.ps1 porque la ejecución de
scripts está deshabilitada en este sistema...
CategoryInfo: SecurityError: (:) [], PSSecurityException
FullyQualifiedErrorId: UnauthorizedAccess
```

No es un problema del proyecto ni de Node.js. Windows trae PowerShell configurado por
defecto para **no ejecutar ningún script** (`.ps1`), como medida de seguridad general —
y resulta que `npm` en Windows es en realidad un script de PowerShell (`npm.ps1`) que
llama al programa real. Con esa protección activada, ni siquiera se deja ejecutar a sí
mismo.

Tienes dos formas de resolverlo, **sin permisos de administrador**:

### Opción 1 — Usa el Símbolo del sistema (cmd) en vez de PowerShell

Es el camino más rápido: `cmd.exe` no tiene esta restricción porque no usa `.ps1`, usa
`npm.cmd` directamente.

1. Pulsa `Win`, escribe **`cmd`** y abre **Símbolo del sistema** (no PowerShell).
2. Entra a la carpeta del proyecto, por ejemplo:
   ```bat
   cd C:\proyectos\recargas-ff
   ```
3. Ejecuta ahí los mismos comandos de siempre:
   ```bat
   npm install
   npm run demo
   ```

Si abriste la terminal con clic derecho → *Abrir en Terminal*, es probable que se haya
abierto PowerShell por defecto. Busca en la ventana una pequeña flecha `⌄` junto a la
pestaña: ahí suele poder elegirse *Símbolo del sistema* en vez de *PowerShell*.

### Opción 2 — Permite scripts solo para tu usuario en PowerShell

Si prefieres seguir en PowerShell, puedes habilitar la ejecución de scripts **solo para
tu usuario** (no afecta al resto del equipo ni requiere administrador):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Te preguntará si confirmas — escribe `S` (o `Y`) y Enter. Ahora sí puedes ejecutar
`npm install` y `npm run demo` normalmente en esa misma ventana.

> Si tu empresa gestiona el equipo y ni siquiera `-Scope CurrentUser` funciona (aparece
> un error de política de grupo), usa la **Opción 1** (cmd), que no depende de esta
> configuración en absoluto.

---

## Cuando quieras ponerla en internet de verdad

Eso es otra cosa: `docker-compose.yml` (sin el `.dev`), pensado para un servidor VPS, con los
secretos en un `.env` propio y la API key real. Los pasos están en el
[`README.md`](README.md), sección 2.

**Nada de lo de esta guía sirve para producción.** `npm run demo` y `docker-compose.dev.yml`
llevan contraseñas escritas a la vista, a propósito, para que puedas ver la plataforma
funcionando sin configurar nada.
