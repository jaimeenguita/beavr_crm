import Link from "next/link";
import type { ReactNode } from "react";

/** Nombre de trabajador RRHH → siempre lleva a su ficha. */
export function StaffNameLink({
  id,
  children,
  className = "crm-table-link",
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  if (!id) return <>{children}</>;
  return (
    <Link href={`/rrhh/${id}`} className={className}>
      {children}
    </Link>
  );
}
