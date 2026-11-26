import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { getDb } from "@/db";
import * as authSchema from "@/db/auth-schema";
import { env } from "@/env";
import { sendEmail } from "@/server/email";

export const VERIFY_SUBJECT = "Verify your email for LF Cert Trainer";
export const RESET_SUBJECT = "Reset your LF Cert Trainer password";

function createAuth() {
  return betterAuth({
    appName: "LF Cert Trainer",
    baseURL: env.baseUrl,
    database: drizzleAdapter(getDb(), { provider: "pg", schema: authSchema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      // A reset signs out every device, in case the old password leaked.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: RESET_SUBJECT,
          text: `Open this link to choose a new password for LF Cert Trainer:\n\n${url}\n\nThe link works for 1 hour. If you did not ask for this, ignore this email; your password stays the same.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: VERIFY_SUBJECT,
          text: `Open this link to verify your email and start studying:\n\n${url}\n\nIf you did not sign up, ignore this email.`,
        });
      },
    },
    socialProviders: env.githubEnabled
      ? { github: { clientId: env.githubClientId!, clientSecret: env.githubClientSecret! } }
      : {},
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: { ...user, role: env.adminEmails.includes(user.email.toLowerCase()) ? "admin" : "user" },
          }),
        },
      },
    },
    plugins: [admin(), nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

/** The Better Auth server instance, created on first use so builds do not need a database. */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}
