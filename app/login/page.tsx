import type { CSSProperties } from 'react';
import { redirect } from 'next/navigation';
import { getOrgBrand } from '@/lib/org';
import { getCurrentUser } from '@/lib/session';
import { LoginForm } from './login-form';
import { ThemeToggle } from '@/components/layout/theme-toggle';

/** A CSS url() for a delivery URL we built ourselves — quotes and backslashes can never appear in it, but are stripped anyway. */
const cssUrl = (u: string): string => `url("${u.replace(/["\\\n\r]/g, '')}")`;

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/dashboard');
  const org = await getOrgBrand();
  const bg = org?.background ?? null;
  // The photograph fills the screen; the darkening (Company Information) keeps the type legible on it.
  const style = bg ? ({ '--login-bg': cssUrl(bg), '--login-shade': String((org?.background_overlay ?? 45) / 100) } as CSSProperties) : undefined;

  return (
    <div className={`login-wrap${bg ? ' has-bg' : ''}`} style={style}>
      <div className="login-mode-toggle"><ThemeToggle /></div>
      <div className="login-brand">
        {org?.logo ? <img className="login-logo" src={org.logo} alt="" /> : null}
        <div className="login-kicker">Welcome to</div>
        <h1>{org?.name || 'Wayside Clinic'}</h1>
        <div className="login-rule" aria-hidden="true" />
        {org?.motto ? <div className="motto">{org.motto}</div> : null}
        <div className="meta">
          {org?.registration_no ? <>Reg. {org.registration_no}<br /></> : null}
          {org?.phone_primary ? <>{org.phone_primary}<br /></> : null}
          {org?.email}
        </div>
      </div>
      <div className="login-form">
        <div className="login-card">
          <div className="login-card-kicker">Staff portal</div>
          <h2>Sign in</h2>
          <p className="sub">Projects · Service Desk · Finance · People</p>
          <LoginForm />
        </div>
      </div>
      <div className="login-foot">© {new Date().getFullYear()} {org?.name || 'Calbytes Technologies'}</div>
    </div>
  );
}
