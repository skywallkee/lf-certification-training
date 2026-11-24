import "server-only";
import { notFound } from "next/navigation";
import { getCatalog } from "./catalog";

export async function loadCert(code: string) {
  const catalog = await getCatalog();
  const cert = catalog.certs.get(code.toUpperCase());
  if (!cert || code !== code.toLowerCase()) notFound();
  return { catalog, cert };
}
