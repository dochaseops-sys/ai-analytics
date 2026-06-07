export interface GA4AuditData {
  eventsLast7Days: Array<{ eventName: string; count: number }>;
  conversions: Array<{ name: string }>;
  duplicatePurchasesCount: number;
  eventsList: string[];
  hasPurchaseEvent: boolean;
  hasLeadEvent: boolean;
  hasFormSubmitEvent: boolean;
}

export interface GTMTag {
  tagId: string;
  name: string;
  type: string;
  firingTriggerId?: string[];
  blockingTriggerId?: string[];
  consentSettings?: any;
}

export interface GTMTrigger {
  triggerId: string;
  name: string;
  type: string;
}

export interface GTMVariable {
  variableId: string;
  name: string;
  type: string;
}

export interface GTMAuditData {
  tags: GTMTag[];
  triggers: GTMTrigger[];
  variables: GTMVariable[];
  hasConsentModeTag: boolean;
}

export interface AuditContext {
  clientId: string;
  ga4PropertyId?: string;
  gtmContainerId?: string;
  ga4Data?: GA4AuditData;
  gtmData?: GTMAuditData;
  websiteUrl?: string;
  industry?: string;
  websiteScan?: {
    businessType: string;
    keyActions: string[];
    detectedLeadForms: string[];
  };
}

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type AuditCategory =
  | 'GA4 Setup'
  | 'GTM Setup'
  | 'Conversion Tracking'
  | 'Event Quality'
  | 'Privacy & Consent';

export interface AuditResult {
  issueId: string;
  severity: Severity;
  title: string;
  description: string;
  recommendation: string;
  category: AuditCategory;
  passed: boolean;
}

export interface AuditRule {
  id: string;
  name: string;
  category: AuditCategory;
  severity: Severity;
  run(context: AuditContext): Promise<AuditResult>;
}
