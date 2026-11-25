import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profile } from "@/db/schema";
import { getAuth } from "@/lib/auth";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  image: string | null;
}

/** The signed-in user for this request, or null. Cached per request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user as typeof session.user & { role?: string | null; banned?: boolean | null };
  if (u.banned) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role ?? "user", image: u.image ?? null };
});

/** The signed-in user, or a redirect to sign in that comes back to `next`. */
export async function requireUser(next: string): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser("/admin");
  if (user.role !== "admin") redirect("/today");
  return user;
}

export const getProfile = cache(async (userId: string) => {
  const [row] = await getDb().select().from(profile).where(eq(profile.userId, userId));
  return row ?? null;
});

/** A signed-in user who has finished onboarding; otherwise a redirect to onboarding. */
export async function requireOnboarded(next: string) {
  const user = await requireUser(next);
  const p = await getProfile(user.id);
  if (!p?.onboardedAt) redirect("/onboarding");
  return { user, profile: p };
}
