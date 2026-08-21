import Link from "next/link";
import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="relative z-10 grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-6xl font-black text-gradient-flame">404</p>
        <h1 className="mt-4 text-xl font-bold">No encontramos esta página</h1>
        <p className="mt-2 text-sm text-muted">
          Puede que el enlace haya cambiado o que el producto ya no esté disponible.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/">
            <Button variant="secondary">Ir al inicio</Button>
          </Link>
          <Link href="/tienda">
            <Button>Ver la tienda</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
