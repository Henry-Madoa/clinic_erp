import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { Page } from '@/components/layout/page';
import { Card, EmptyState, Tabs } from '@/components/ui/primitives';
import { SalesReceivablesSetupCard, PurchasesPayablesSetupCard } from '@/components/admin/module-setup-cards';
import { OutboxTab } from '../outbox-tab';
import { CompaniesTab } from '../companies-tab';
import { hasTabAccess, POOL_GROUPS, ADMIN_TABS, WORKFLOW_TABS, SECURITY_TABS, DATA_TABS, COMPANY_TABS, INTEGRATION_TABS } from '@/lib/adminNav';
import { MpesaIntegrationTab, EmailIntegrationTab, EtimsIntegrationTab } from '../tabs/integrations';
import { GeneralLedgerSetupTab, CompanyTab, AppearanceTab, DataManagementTab } from '../tabs/setup';
import { UsersTab, RolesTab, ProfilesTab, ApprovalUserSetupTab, AuditTab, ChangeLogTab } from '../tabs/security';
import { JobQueueTab, DocumentNoSeriesTab, NoSeriesTab, DimensionsTab, CurrenciesAdminTab } from '../tabs/general';
import { SalaryScalesTab, JobGradesTab, ContractTypesTab, TerminationReasonsTab, ClearanceSectionsTab, LeaveTypesTab, LeaveCalendarTab, HolidaysTab, AccrueMatrixTab, PayrollSetupTab, PostingGroupsTab, PayeBandsTab, NssfTiersTab, TransactionCodesTab } from '../tabs/hr';
import { PaymentTermsTab, PaymentMethodsTab, CustomerPostingGroupsTab, VendorPostingGroupsTab, ImprestPurposesTab, VatPostingSetupTab } from '../tabs/finance';
import { DenominationsTab, CashierSetupTab } from '../tabs/cash-office';
import { WorkflowsTab, WorkflowGroupsTab, TableRelationsTab } from '../tabs/workflow';

const TABS = ADMIN_TABS;

export default async function AdminPage({ params, searchParams }: {
  params: Promise<{ tab?: string[] }>;
  searchParams: Promise<{
    q?: string; filters?: string; sort?: string; grade?: string; service?: string; status?: string;
    bf?: string; pf?: string; rf?: string; d1?: string; d2?: string;
  }>;
}) {
  const user = await requireUser();
  const { tab: segments } = await params;
  const searchParamsAll = await searchParams;
  const { q = '', filters: filtersRaw, sort: sortRaw } = searchParamsAll;

  // The Admin Centre is reachable by anyone holding at least one admin
  // permission, so the visible tabs — and the default — depend on the role.
  const allowed = TABS.filter((t) => hasTabAccess(user, t));
  if (!allowed.length) {
    return (
      <Page title="Admin Centre" crumb="Configuration, security and appearance" user={user}>
        <Card>
          <EmptyState icon="🔒" title="No administration rights"
            sub="Your role does not include any Admin Centre permissions" />
        </Card>
      </Page>
    );
  }

  const requested = segments?.[0];
  if (requested && !TABS.some((t) => t.key === requested)) notFound();
  const tab = allowed.some((t) => t.key === requested) ? requested! : allowed[0].key;

  // Setup Pool: category (segments[1]) then screen (segments[2]).
  const poolGroupsAllowed = POOL_GROUPS
    .map((g) => ({ key: g.key, label: g.label, screens: g.screens.filter((s) => hasTabAccess(user, s)) }))
    .filter((g) => g.screens.length);
  const poolGroupSub = segments?.[1];
  const poolScreenSub = segments?.[2];
  if (tab === 'pool' && poolGroupSub && !POOL_GROUPS.some((g) => g.key === poolGroupSub)) notFound();
  const poolGroup = tab === 'pool'
    ? (poolGroupsAllowed.find((g) => g.key === poolGroupSub) ?? poolGroupsAllowed[0])
    : undefined;
  if (tab === 'pool' && poolScreenSub && poolGroup && !poolGroup.screens.some((s) => s.key === poolScreenSub)
    && POOL_GROUPS.some((g) => g.screens.some((s) => s.key === poolScreenSub)) === false) notFound();
  const poolScreen = poolGroup
    ? (poolGroup.screens.find((s) => s.key === poolScreenSub) ?? poolGroup.screens[0])
    : undefined;

  const companyAllowed = COMPANY_TABS.filter((t) => hasTabAccess(user, t));
  const companySub = segments?.[1];
  if (tab === 'company' && companySub && !COMPANY_TABS.some((t) => t.key === companySub)) notFound();
  const companyTab = tab === 'company' && companyAllowed.some((t) => t.key === companySub) ? companySub! : companyAllowed[0]?.key;

  const dataAllowed = DATA_TABS.filter((t) => hasTabAccess(user, t));
  const dataSub = segments?.[1];
  if (tab === 'data' && dataSub && !DATA_TABS.some((t) => t.key === dataSub)) notFound();
  const dataTab = tab === 'data' && dataAllowed.some((t) => t.key === dataSub) ? dataSub! : dataAllowed[0]?.key;

  const integrationAllowed = INTEGRATION_TABS.filter((t) => hasTabAccess(user, t));
  const integrationSub = segments?.[1];
  if (tab === 'integrations' && integrationSub && !INTEGRATION_TABS.some((t) => t.key === integrationSub)) notFound();
  const integrationTab = tab === 'integrations' && integrationAllowed.some((t) => t.key === integrationSub)
    ? integrationSub! : integrationAllowed[0]?.key;

  const workflowAllowed = WORKFLOW_TABS.filter((t) => hasTabAccess(user, t));
  const workflowSub = segments?.[1];
  if (tab === 'workflows' && workflowSub && !WORKFLOW_TABS.some((t) => t.key === workflowSub)) notFound();
  const workflowTab = tab === 'workflows' && workflowAllowed.some((t) => t.key === workflowSub)
    ? workflowSub! : workflowAllowed[0]?.key;

  const securityAllowed = SECURITY_TABS.filter((t) => hasTabAccess(user, t));
  const securitySub = segments?.[1];
  if (tab === 'security' && securitySub && !SECURITY_TABS.some((t) => t.key === securitySub)) notFound();
  const securityTab = tab === 'security' && securityAllowed.some((t) => t.key === securitySub)
    ? securitySub! : securityAllowed[0]?.key;

  return (
    <Page title="Admin Centre" crumb="Configuration, security and appearance" user={user}>
      <Tabs tabs={allowed} active={tab} hrefFor={(k) => `/admin/${k}`} />
      {tab === 'company' ? (
        <>
          <Tabs tabs={companyAllowed} active={companyTab} hrefFor={(k) => (k === 'information' ? '/admin/company' : `/admin/company/${k}`)} />
          {companyTab === 'information' ? <CompanyTab /> : null}
          {companyTab === 'companies' ? <CompaniesTab filters={filtersRaw} /> : null}
        </>
      ) : null}
      {tab === 'appearance' ? <AppearanceTab /> : null}
      {tab === 'pool' && poolGroup && poolScreen ? (
        <>
          <Tabs tabs={poolGroupsAllowed.map((g) => ({ key: g.key, label: g.label }))} active={poolGroup.key}
            hrefFor={(k) => `/admin/pool/${k}`} />
          <Tabs tabs={poolGroup.screens} active={poolScreen.key}
            hrefFor={(k) => `/admin/pool/${poolGroup.key}/${k}`} />
          {poolScreen.key === 'gl-setup' ? <GeneralLedgerSetupTab /> : null}
          {poolScreen.key === 'sales-receivables-setup' ? <SalesReceivablesSetupCard /> : null}
          {poolScreen.key === 'purchases-payables-setup' ? <PurchasesPayablesSetupCard /> : null}
          {poolScreen.key === 'dimensions' ? <DimensionsTab d1={searchParamsAll.d1} d2={searchParamsAll.d2} /> : null}
          {poolScreen.key === 'document-no-series' ? <DocumentNoSeriesTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'no-series' ? <NoSeriesTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'automation' ? <JobQueueTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'cashier-setup' ? <CashierSetupTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'denominations' ? <DenominationsTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'payment-terms' ? <PaymentTermsTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'payment-methods' ? <PaymentMethodsTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'customer-posting-groups' ? <CustomerPostingGroupsTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'vendor-posting-groups' ? <VendorPostingGroupsTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'currencies' ? <CurrenciesAdminTab filters={filtersRaw} rateFilters={searchParamsAll.rf} /> : null}
          {poolScreen.key === 'vat-posting-setup' ? <VatPostingSetupTab filters={filtersRaw} busFilters={searchParamsAll.bf} prodFilters={searchParamsAll.pf} /> : null}
          {poolScreen.key === 'imprest-purposes' ? <ImprestPurposesTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'job-grades' ? <JobGradesTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'salary-scales' ? <SalaryScalesTab grade={searchParamsAll.grade} /> : null}
          {poolScreen.key === 'contract-types' ? <ContractTypesTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'termination-reasons' ? <TerminationReasonsTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'clearance-sections' ? <ClearanceSectionsTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'leave-types' ? <LeaveTypesTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'leave-calendar' ? <LeaveCalendarTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'holidays' ? <HolidaysTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'accrue-matrix' ? <AccrueMatrixTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'payroll-setup' ? <PayrollSetupTab /> : null}
          {poolScreen.key === 'posting-groups' ? <PostingGroupsTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'paye-bands' ? <PayeBandsTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'nssf-tiers' ? <NssfTiersTab filters={filtersRaw} /> : null}
          {poolScreen.key === 'transaction-codes' ? <TransactionCodesTab filters={filtersRaw} /> : null}
        </>
      ) : null}
      {tab === 'workflows' ? (
        <>
          <Tabs tabs={workflowAllowed} active={workflowTab} hrefFor={(k) => `/admin/workflows/${k}`} />
          {workflowTab === 'definitions' ? <WorkflowsTab filters={filtersRaw} /> : null}
          {workflowTab === 'groups' ? <WorkflowGroupsTab filters={filtersRaw} /> : null}
          {workflowTab === 'tables' ? <TableRelationsTab filters={filtersRaw} /> : null}
        </>
      ) : null}
      {tab === 'security' ? (
        <>
          <Tabs tabs={securityAllowed} active={securityTab} hrefFor={(k) => `/admin/security/${k}`} />
          {securityTab === 'users' ? <UsersTab filters={filtersRaw} /> : null}
          {securityTab === 'setup' ? <ApprovalUserSetupTab filters={filtersRaw} /> : null}
          {securityTab === 'roles' ? <RolesTab filters={filtersRaw} /> : null}
          {securityTab === 'profiles' ? <ProfilesTab filters={filtersRaw} /> : null}
          {securityTab === 'audit' ? <AuditTab search={q} filtersRaw={filtersRaw} sortRaw={sortRaw} /> : null}
          {securityTab === 'changelog' ? <ChangeLogTab search={q} filtersRaw={filtersRaw} sortRaw={sortRaw} /> : null}
        </>
      ) : null}
      {tab === 'data' ? (
        <>
          <Tabs tabs={dataAllowed} active={dataTab} hrefFor={(k) => (k === 'management' ? '/admin/data' : `/admin/data/${k}`)} />
          {dataTab === 'management' ? <DataManagementTab filters={filtersRaw} /> : null}
          {dataTab === 'outbox' ? <OutboxTab status={searchParamsAll.status} search={q} filters={filtersRaw} /> : null}
        </>
      ) : null}
      {tab === 'integrations' ? (
        <>
          <Tabs tabs={integrationAllowed} active={integrationTab} hrefFor={(k) => `/admin/integrations/${k}`} />
          {integrationTab === 'mpesa' ? <MpesaIntegrationTab filters={filtersRaw} /> : null}
          {integrationTab === 'email' ? <EmailIntegrationTab /> : null}
          {integrationTab === 'etims' ? <EtimsIntegrationTab filters={filtersRaw} /> : null}
        </>
      ) : null}
    </Page>
  );
}
