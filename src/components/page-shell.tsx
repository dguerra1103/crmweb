import type { ReactNode } from "react";

/** Contenedor de las pantallas que no son el inbox: scroll propio y ancho cómodo. */
export function PageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="thin-scroll h-full overflow-y-auto">
      <div className={`mx-auto px-6 py-7 ${wide ? "max-w-[1400px]" : "max-w-6xl"}`}>{children}</div>
    </div>
  );
}
