"use client";
import { useActionState } from "react";
import { loginAction, signupAction } from "@/app/actions";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const [state, action, pending] = useActionState(mode === "login" ? loginAction : signupAction, {} as { error?: string });
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <div><label htmlFor="email" className="label mb-2 block">Email</label><input id="email" name="email" type="email" required autoComplete="email" className="field" /></div>
      <div><label htmlFor="password" className="label mb-2 block">Password</label><input id="password" name="password" type="password" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} className="field" aria-describedby={state.error ? "auth-e" : undefined} /></div>
      {state.error && <p id="auth-e" role="alert" className="font-semibold"><span className="chip chip-critical mr-2">Fix</span>{state.error}</p>}
      <button className="btn btn-accent w-full" disabled={pending}>{pending ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}</button>
    </form>
  );
}
