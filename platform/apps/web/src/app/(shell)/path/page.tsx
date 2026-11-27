import { permanentRedirect } from "next/navigation";

/** The path map now lives on /certs (merged with the catalogue); old links and bookmarks land there. */
export default function PathPage() {
  permanentRedirect("/certs");
}
