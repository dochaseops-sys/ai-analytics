import { google } from 'googleapis';
import { getValidAccessToken } from '@/lib/google-auth';
import { adminDb } from '@/lib/firebase-admin';
import { GA4AuditData, GTMAuditData, GTMTag, GTMTrigger, GTMVariable } from '@/lib/audit-engine/types';

export async function fetchAuditEvidence(clientId: string): Promise<{
  ga4Data?: GA4AuditData;
  gtmData?: GTMAuditData;
  websiteUrl?: string;
  trafficSources?: Array<{ sourceMedium: string; sessions: number }>;
  pageTraffic?: Array<{ pagePath: string; sessions: number; conversions: number }>;
}> {
  const [ga4Doc, gtmDoc] = await Promise.all([
    adminDb.collection('ga4_properties').doc(clientId).get(),
    adminDb.collection('gtm_containers').doc(clientId).get()
  ]);

  const ga4 = ga4Doc.exists ? ga4Doc.data() : null;
  const gtm = gtmDoc.exists ? gtmDoc.data() : null;
  const accessToken = await getValidAccessToken(clientId);
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  let ga4Data: GA4AuditData | undefined;
  let gtmData: GTMAuditData | undefined;
  let websiteUrl: string | undefined;
  let trafficSources: Array<{ sourceMedium: string; sessions: number }> = [];
  let pageTraffic: Array<{ pagePath: string; sessions: number; conversions: number }> = [];

  if (ga4?.propertyId) {
    const analyticsdata = google.analyticsdata({ version: 'v1beta', auth: oauth2Client });
    const analyticsadmin = google.analyticsadmin({ version: 'v1alpha', auth: oauth2Client });

    const eventReport = await analyticsdata.properties.runReport({
      property: `properties/${ga4.propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }]
      }
    });

    const eventsLast7Days = (eventReport.data.rows || []).map((row) => ({
      eventName: row.dimensionValues?.[0]?.value || 'unknown',
      count: parseInt(row.metricValues?.[0]?.value || '0', 10)
    }));
    const eventsList = eventsLast7Days.map((event) => event.eventName);

    const conversionsRes = await analyticsadmin.properties.conversionEvents.list({
      parent: `properties/${ga4.propertyId}`
    });
    const conversions = (conversionsRes.data.conversionEvents || []).map((conversion) => ({ name: conversion.eventName || '' }));

    let duplicatePurchasesCount = 0;
    try {
      const duplicates = await analyticsdata.properties.runReport({
        property: `properties/${ga4.propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'eventName' }, { name: 'transactionId' }],
          metrics: [{ name: 'eventCount' }],
          dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'purchase' } } }
        }
      });
      duplicatePurchasesCount = (duplicates.data.rows || []).filter((row) => {
        const count = parseInt(row.metricValues?.[0]?.value || '0', 10);
        const txId = row.dimensionValues?.[1]?.value;
        return count > 1 && Boolean(txId) && txId !== '(not set)';
      }).length;
    } catch (error) {
      console.warn('[Personalised Audit] Duplicate purchase query failed', error);
    }

    try {
      const sourceReport = await analyticsdata.properties.runReport({
        property: `properties/${ga4.propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'sessionSourceMedium' }],
          metrics: [{ name: 'sessions' }],
          limit: '25'
        }
      });
      trafficSources = (sourceReport.data.rows || []).map((row) => ({
        sourceMedium: row.dimensionValues?.[0]?.value || 'unknown',
        sessions: parseInt(row.metricValues?.[0]?.value || '0', 10)
      }));
    } catch (error) {
      console.warn('[Personalised Audit] Source traffic query failed', error);
    }

    try {
      const pageReport = await analyticsdata.properties.runReport({
        property: `properties/${ga4.propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'pagePath' }],
          metrics: [{ name: 'sessions' }, { name: 'conversions' }],
          limit: '50'
        }
      });
      pageTraffic = (pageReport.data.rows || []).map((row) => ({
        pagePath: row.dimensionValues?.[0]?.value || '/',
        sessions: parseInt(row.metricValues?.[0]?.value || '0', 10),
        conversions: parseInt(row.metricValues?.[1]?.value || '0', 10)
      }));
    } catch (error) {
      console.warn('[Personalised Audit] Page traffic query failed', error);
    }

    try {
      const streamsRes = await analyticsadmin.properties.dataStreams.list({ parent: `properties/${ga4.propertyId}` });
      const stream = (streamsRes.data.dataStreams || []).find((item) => item.type === 'WEB_DATA_STREAM' && item.webStreamData?.defaultUri);
      websiteUrl = stream?.webStreamData?.defaultUri || undefined;
    } catch (error) {
      console.warn('[Personalised Audit] Web stream lookup failed', error);
    }

    ga4Data = {
      eventsLast7Days,
      conversions,
      duplicatePurchasesCount,
      eventsList,
      hasPurchaseEvent: eventsList.some((event) => /purchase|transaction|order_completed/i.test(event)),
      hasLeadEvent: eventsList.some((event) => /generate_lead|lead|form|contact|enquiry|signup/i.test(event)),
      hasFormSubmitEvent: eventsList.some((event) => /form_submit|submit_form/i.test(event))
    };
  }

  if (gtm?.containerId && gtm?.accountId) {
    const tagmanager = google.tagmanager({ version: 'v2', auth: oauth2Client });
    const workspaces = await tagmanager.accounts.containers.workspaces.list({
      parent: `accounts/${gtm.accountId}/containers/${gtm.containerId}`
    });
    const workspacePath = workspaces.data.workspace?.[0]?.path;
    if (workspacePath) {
      const [tagsRes, triggersRes, variablesRes] = await Promise.all([
        tagmanager.accounts.containers.workspaces.tags.list({ parent: workspacePath }),
        tagmanager.accounts.containers.workspaces.triggers.list({ parent: workspacePath }),
        tagmanager.accounts.containers.workspaces.variables.list({ parent: workspacePath })
      ]);

      const tags: GTMTag[] = (tagsRes.data.tag || []).map((tag) => ({
        tagId: tag.tagId || '',
        name: tag.name || '',
        type: tag.type || '',
        firingTriggerId: tag.firingTriggerId || [],
        blockingTriggerId: tag.blockingTriggerId || [],
        consentSettings: tag.consentSettings as Record<string, unknown> | undefined || undefined
      }));
      const triggers: GTMTrigger[] = (triggersRes.data.trigger || []).map((trigger) => ({
        triggerId: trigger.triggerId || '',
        name: trigger.name || '',
        type: trigger.type || ''
      }));
      const variables: GTMVariable[] = (variablesRes.data.variable || []).map((variable) => ({
        variableId: variable.variableId || '',
        name: variable.name || '',
        type: variable.type || ''
      }));

      gtmData = {
        tags,
        triggers,
        variables,
        hasConsentModeTag: tags.some((tag) => /consent|cookiebot|onetrust/i.test(`${tag.name} ${tag.type}`))
      };
    }
  }

  return { ga4Data, gtmData, websiteUrl, trafficSources, pageTraffic };
}
