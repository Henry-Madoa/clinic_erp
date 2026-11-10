import { requireAction } from '@/lib/session';
import { getOrgBrand } from '@/lib/org';
import { queueCounts, queueDisplay } from '@/lib/clinic/visits';
import { QueueDisplay } from '@/components/clinic/queue-display';

/** The waiting-room TV — full screen, no app chrome. Open it on the screen's browser and leave it. */
export default async function QueueDisplayPage() {
  await requireAction('QUEUES_WORK');
  const [org, display, counts] = await Promise.all([getOrgBrand(), queueDisplay(), queueCounts()]);
  return <QueueDisplay clinic={org?.name ?? 'Clinic'} initial={{ display, counts }} />;
}
