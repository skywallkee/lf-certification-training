"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordResetAction, resetPasswordAction, signInAction, signUpAction, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signInAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.fields?.email} aria-invalid={Boolean(state.error)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-sm">
            Forgot your password?
          </Link>
        </div>
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={Boolean(state.error)} />
      </div>
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in with email"}
      </Button>
      <p className="text-sm text-muted-foreground">
        New here? <Link href={`/sign-up${next !== "/today" ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</Link>
      </p>
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signUpAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Display name</Label>
        <Input id="name" name="name" autoComplete="nickname" required defaultValue={state.fields?.name} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.fields?.email} />
        <FieldHint id="email-hint">We send a link to verify it.</FieldHint>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required aria-describedby="password-hint" />
        <FieldHint id="password-hint">At least 10 characters.</FieldHint>
      </div>
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordResetAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.fields?.email ?? email} aria-invalid={Boolean(state.error)} />
      </div>
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Remembered it? <Link href="/sign-in">Sign in</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required aria-describedby="password-hint" />
        <FieldHint id="password-hint">At least 10 characters.</FieldHint>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">Repeat the new password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
