"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getDb } from "@/db";
import { flag } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { requireAdmin } from "@/server/session";

/** Disables (bans) or re-enables a user through Better Auth's admin plugin, which also ends their sessions. */
export async function setUserDisabledAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = z.string().min(1).parse(form.get("userId"));
  if (userId === admin.id) throw new Error("You cannot disable your own account.");
  const disable = form.get("disable") === "1";
  const auth = getAuth();
  const h = await headers();
  if (disable) {
    await auth.api.banUser({ body: { userId, banReason: "Disabled by an admin" }, headers: h });
  } else {
    await auth.api.unbanUser({ body: { userId }, headers: h });
  }
  revalidatePath("/admin");
}

export async function resolveFlagAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = z.coerce.number().int().positive().parse(form.get("flagId"));
  await getDb().update(flag).set({ status: "resolved", resolvedAt: new Date() }).where(eq(flag.id, id));
  revalidatePath("/admin");
}
