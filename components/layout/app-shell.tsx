import type { CSSProperties, ReactNode } from 'react';
import { getOrgBrand } from '@/lib/org';
import { requireUser } from '@/lib/session';
import { canPage, canNav } from '@/lib/permissions';
import { myPendingWorkflowTaskCount } from '@/lib/workflow';
import { NAV, isSubMenu } from '@/lib/nav';
import { Sidebar } from '@/components/layout/sidebar';
import { NavProvider } from '@/components/layout/nav-context';
import { PrintPreviewMode } from '@/components/ui/print-preview-mode';
import { GlobalSearchProvider } from '@/components/layout/global-search';
import { buildSearchIndex } from '@/lib/globalSearch';
import { RoleExplorerProvider } from '@/components/layout/role-explorer';
import { buildRoleExplorer } from '@/lib/roleExplorer';

export async function AppShell({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const org = (await getOrgBrand())!;

  // Resolve navigation visibility here so the browser only ever learns which
  // links to draw, not the permission list that produced them. canNav() is stricter than
  // canPage(): a screen with a read/view action (e.g. FRONT_OFFICE -> RESERVATIONS_READ) is only listed when the
  // user can actually read its data, not just reach the page shell.
  const allowedPaths = NAV
    .flatMap((g) => g.items.flatMap((i) => (isSubMenu(i) ? i.items : [i])))
    .filter((i) => canNav(user, i.page))
    .map((i) => i.path);

  // The badge is what this user personally has to act on, not an org-wide pending count —
  // otherwise it stops meaning "you have something to do" the moment anyone else has a backlog.
  const badges = canPage(user, 'APPROVALS')
    ? { pendingApprovals: await myPendingWorkflowTaskCount(user.id, user.username) }
    : {};

  // Business Central "Tell Me": every page this user may open, searchable from the top bar (Alt+Q).
  const searchIndex = buildSearchIndex(user);
  // Business Central "Explore all" (the ☰ button): every Role Centre profile as an area.
  const explorerAreas = await buildRoleExplorer(user);

  // Company Information may put the sign-in photograph faintly behind every page.
  // The URL is our own Cloudinary delivery URL; quotes, backslashes and line breaks are stripped regardless.
  const backdrop = org.background && org.background_in_app
    ? ({ '--app-backdrop': `url("${org.background.replace(/["\\\n\r]/g, '')}")` } as CSSProperties)
    : undefined;

  return (
    <NavProvider>
      <PrintPreviewMode />
      <GlobalSearchProvider entries={searchIndex}>
        <RoleExplorerProvider areas={explorerAreas} orgName={org.short_name || org.name || 'Wayside Clinic'}>
          <div className={`shell${backdrop ? ' has-backdrop' : ''}`} style={backdrop}>
            <Sidebar org={org} user={user} allowedPaths={allowedPaths} badges={badges} />
            <div className="main">{children}</div>
          </div>
        </RoleExplorerProvider>
      </GlobalSearchProvider>
    </NavProvider>
  );
}
