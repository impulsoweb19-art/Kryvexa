import type { Metadata } from "next";
import Link from "next/link";
import { getConfig } from "@/server/services/settings";

export const metadata: Metadata = { title: "Términos y condiciones" };
export const dynamic = "force-dynamic";

/**
 * Borrador genérico para una tienda de recargas de saldo/diamantes de juegos.
 * No sustituye asesoría legal: antes de publicar en producción, que un
 * abogado lo revise y lo ajuste a la operación real del negocio (RUC,
 * domicilio fiscal, libro de reclamaciones si aplica, etc.).
 */
export default async function TermsPage() {
  const config = await getConfig();
  const name = config.storeName || "Kryvexa";
  const updated = new Date().toLocaleDateString("es-PE", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Lima",
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← Volver al inicio
      </Link>

      <h1 className="mt-6 text-2xl font-bold sm:text-3xl">Términos y condiciones</h1>
      <p className="mt-2 text-sm text-muted">Última actualización: {updated}.</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-ink [&_p+p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        <section>
          <h2>1. Sobre {name}</h2>
          <p>
            {name} es una plataforma independiente de venta de recargas, diamantes, pases y productos
            digitales para videojuegos. No está afiliada, patrocinada ni respaldada por Garena, sus
            estudios asociados ni los titulares de las marcas de los juegos que aparecen en el catálogo.
            Los nombres, logos e imágenes de esos juegos se muestran únicamente con fines de
            identificación del producto.
          </p>
        </section>

        <section>
          <h2>2. Cuenta de usuario</h2>
          <p>
            Para comprar necesitas crear una cuenta con un correo válido y una contraseña. Eres
            responsable de mantener tus credenciales en secreto y de toda actividad realizada desde tu
            cuenta. Si sospechas un acceso no autorizado, cambia tu contraseña de inmediato y
            contáctanos.
          </p>
        </section>

        <section>
          <h2>3. Precios y pagos</h2>
          <p>
            Los precios se muestran en soles (S/) e incluyen nuestro margen sobre el costo del
            proveedor; pueden variar sin previo aviso según el tipo de cambio. El pago se realiza
            mediante Yape u otros métodos habilitados en la plataforma, acreditando el importe a tu
            billetera interna antes de canjearlo por un producto. Una recarga de billetera aprobada no
            es reembolsable en efectivo, salvo lo previsto en la sección de reembolsos.
          </p>
        </section>

        <section>
          <h2>4. Entrega de productos</h2>
          <p>
            La entrega de diamantes, pases o saldo suele ser inmediata, pero puede demorar mientras se
            confirma con el proveedor. Es tu responsabilidad ingresar correctamente el ID de jugador u
            otros datos solicitados: {name} no se hace responsable por recargas entregadas a una cuenta
            incorrecta cuando el dato fue ingresado erróneamente por el usuario.
          </p>
        </section>

        <section>
          <h2>5. Reembolsos y pedidos fallidos</h2>
          <ul>
            <li>Si una recarga falla por un error del proveedor, el importe se devuelve a tu billetera.</li>
            <li>
              Si un pedido queda &quot;en proceso&quot; por más tiempo del esperado, contáctanos con tu
              código de pedido para revisarlo.
            </li>
            <li>
              No se realizan reembolsos cuando el producto ya fue entregado correctamente al ID de
              jugador indicado por el usuario.
            </li>
          </ul>
        </section>

        <section>
          <h2>6. Uso indebido</h2>
          <p>
            Nos reservamos el derecho de suspender cuentas que incurran en fraude, uso de medios de pago
            robados, intentos de manipular precios o abuso de las políticas de reembolso.
          </p>
        </section>

        <section>
          <h2>7. Cambios en estos términos</h2>
          <p>
            Podemos actualizar estos términos para reflejar cambios en la operación del negocio. La
            versión vigente es siempre la publicada en esta página.
          </p>
        </section>

        <section>
          <h2>8. Contacto</h2>
          <p>
            ¿Dudas sobre tu pedido o estos términos?{" "}
            {config.supportEmail ? (
              <>
                Escríbenos a <a className="underline hover:text-ink" href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a>
                {config.supportWhatsapp ? " o por WhatsApp." : "."}
              </>
            ) : config.supportWhatsapp ? (
              "Escríbenos por WhatsApp."
            ) : (
              "Contáctanos desde la sección de soporte de la plataforma."
            )}
          </p>
        </section>
      </div>
    </div>
  );
}
