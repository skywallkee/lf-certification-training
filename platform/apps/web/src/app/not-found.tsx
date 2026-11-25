import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-4">
      <h1 className="text-[30px] font-bold">Page not found</h1>
      <p className="text-[15px] text-muted-foreground">This page does not exist or has moved. The cert list is a good place to start again.</p>
      <div>
        <Link href="/certs" className={buttonVariants()}>
          Browse the certs
        </Link>
      </div>
    </main>
  );
}
