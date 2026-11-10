'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signIn, type SignInState } from '@/app/actions/auth';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn block" type="submit" disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

/** No demo-account shortcuts here: a sign-in page should not advertise usernames to strangers. */
export function LoginForm() {
  const [state, formAction] = useActionState<SignInState, FormData>(signIn, {});
  return (
    <form action={formAction}>
      <div className="field">
        <label htmlFor="u">Username</label>
        <input id="u" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      </div>
      <div className="field">
        <label htmlFor="p">Password</label>
        <input id="p" name="password" type="password" autoComplete="current-password" required />
      </div>
      <SubmitButton />
      <div className="login-err" role="status">{state?.error}</div>
    </form>
  );
}
