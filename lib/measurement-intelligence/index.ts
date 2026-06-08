import { GA4AuditData, GTMAuditData } from '@/lib/audit-engine/types';
import { ClientProfile, WebsiteSnapshot } from '@/lib/client-intelligence/types';
import { runPersonalisedAudit } from '@/lib/personalised-audit/personalised-audit-engine';

export async function runMeasurementIntelligence(input: {
  clientProfile: ClientProfile;
  ga4Data?: GA4AuditData;
  gtmData?: GTMAuditData;
  websiteSnapshot?: WebsiteSnapshot;
}) {
  return runPersonalisedAudit(input);
}
