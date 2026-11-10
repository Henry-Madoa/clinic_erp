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
  const style = bg ? ({ '--login-bg': cssUrl(bg), '--login-shade': String((org?.background_overlay ?? 45) / 100) } as CSSProperties) : undefined;

  return (
    <main className="login-entry" style={style}>
      <div className="login-mode-toggle"><ThemeToggle /></div>
      <div className="login-card">
        <div className="login-brand">
          {org?.logo ? <img className="login-logo" src={org.logo} alt="" /> : null}
          <div className="login-kicker">Clinic management system</div>
          <h1>{org?.name || 'Wayside Clinic'}</h1>
          {org?.motto ? <div className="motto">{org.motto}</div> : null}
          {(org?.registration_no || org?.phone_primary || org?.email) && <div className="meta">
            {org?.registration_no ? <span>Reg. {org.registration_no}</span> : null}
            {org?.phone_primary ? <span>{org.phone_primary}</span> : null}
            {org?.email ? <span>{org.email}</span> : null}
          </div>}
        </div>
        <div className="login-card-kicker">Staff portal</div>
        <h2>Sign in</h2>
        <p className="sub">Use your staff account to access your clinic workspace.</p>
        <LoginForm />
      </div>
      <footer className="login-foot">
        © {new Date().getFullYear()} {org?.name || 'Wayside Clinic'} · Powered by Calbytes Technologies Limited
      </footer>
    </main>
  );
}
