import { adminDb } from '../lib/firebase-admin';
import { runAudit } from '../lib/audit-engine';
import { getValidAccessToken } from '../lib/google-auth';
import { google } from 'googleapis';
import { GA4AuditData, GTMAuditData, GTMTag, GTMTrigger, GTMVariable } from '../lib/audit-engine/types';
import { scanWebsite } from '../lib/website-scanner';

async function executeNightlyAudit() {
  console.log('Starting nightly tracking health audits...');

  try {
    const clientsSnap = await adminDb.collection('clients').get();
    console.log(`Found ${clientsSnap.size} clients to audit.`);

    for (const clientDoc of clientsSnap.docs) {
      const clientId = clientDoc.id;
      const clientData = clientDoc.data();
      console.log(`Auditing client: ${clientData.name} (${clientId})...`);

      const ga4Doc = await adminDb.collection('ga4_properties').doc(clientId).get();
      const gtmDoc = await adminDb.collection('gtm_containers').doc(clientId).get();

      const ga4DataDb = ga4Doc.exists ? ga4Doc.data() : null;
      const gtmDataDb = gtmDoc.exists ? gtmDoc.data() : null;

      let ga4PropertyId = ga4DataDb?.propertyId;
      let gtmContainerId = gtmDataDb?.containerId;
      let gtmAccountId = gtmDataDb?.accountId;

      let ga4Data: GA4AuditData | undefined;
      let gtmData: GTMAuditData | undefined;

      let websiteUrl: string | undefined;
      let websiteScan: any = undefined;

      let accessToken: string | null = null;
      try {
        accessToken = await getValidAccessToken(clientId);
      } catch (err) {
        console.warn(`[Client ${clientId}] Google Credentials not linked or expired:`, (err as Error).message);
      }

      if (accessToken) {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials({ access_token: accessToken });

        if (ga4PropertyId) {
          try {
            const analyticsdata = google.analyticsdata({ version: 'v1beta', auth: oauth2Client });
            const analyticsadmin = google.analyticsadmin({ version: 'v1alpha', auth: oauth2Client });

            const reportRes = await analyticsdata.properties.runReport({
              property: `properties/${ga4PropertyId}`,
              requestBody: {
                dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
                dimensions: [{ name: 'eventName' }],
                metrics: [{ name: 'eventCount' }]
              }
            });

            const rows = reportRes.data.rows || [];
            const eventsLast7Days = rows.map(r => ({
              eventName: r.dimensionValues?.[0]?.value || 'unknown',
              count: parseInt(r.metricValues?.[0]?.value || '0', 10)
            }));

            const eventsList = eventsLast7Days.map(e => e.eventName);
            // Get Configured Conversions
            const conversionsRes = await analyticsadmin.properties.conversionEvents.list({
              parent: `properties/${ga4PropertyId}`
            });
            const conversions = (conversionsRes.data.conversionEvents || []).map(c => ({
              name: c.eventName || ''
            }));

            const purchaseEventNames = ['purchase', 'ecommerce_purchase', 'checkout_complete', 'order_completed', 'subscribe', 'transaction'];
            const hasPurchaseEvent = eventsList.some(e => 
              purchaseEventNames.includes(e.toLowerCase())
            ) || conversions.some(c => 
              c.name.toLowerCase() !== 'purchase' && purchaseEventNames.includes(c.name.toLowerCase())
            );
            
            // Check for any lead-related events: generate_lead, lead, sign_up, signup, registration, register, contact, etc.
            const leadEventNames = ['generate_lead', 'lead', 'sign_up', 'signup', 'registration', 'register', 'complete_registration', 'contact', 'contact_us'];
            const hasLeadEvent = eventsList.some(e => 
              leadEventNames.includes(e.toLowerCase())
            ) || conversions.some(c => 
              leadEventNames.includes(c.name.toLowerCase())
            );
            
            const hasFormSubmitEvent = eventsList.some(e => 
              ['form_submit', 'submit_form'].includes(e.toLowerCase())
            );

            let duplicatePurchasesCount = 0;
            try {
              const duplicatesRes = await analyticsdata.properties.runReport({
                property: `properties/${ga4PropertyId}`,
                requestBody: {
                  dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
                  dimensions: [{ name: 'eventName' }, { name: 'transactionId' }],
                  metrics: [{ name: 'eventCount' }],
                  dimensionFilter: {
                    filter: {
                      fieldName: 'eventName',
                      stringFilter: { value: 'purchase' }
                    }
                  }
                }
              });
              const dupRows = duplicatesRes.data.rows || [];
              duplicatePurchasesCount = dupRows.filter(r => {
                const count = parseInt(r.metricValues?.[0]?.value || '0', 10);
                const txId = r.dimensionValues?.[1]?.value;
                return count > 1 && !!txId && txId !== '(not set)';
              }).length;
            } catch (dupErr) {
              console.error(`[Client ${clientId}] Error duplicate purchase query:`, dupErr);
            }

            // Fetch Web Data Streams to get websiteUrl and scan the website
            try {
              const streamsRes = await analyticsadmin.properties.dataStreams.list({
                parent: `properties/${ga4PropertyId}`
              });
              const streams = streamsRes.data.dataStreams || [];
              const webStream = streams.find(s => s.type === 'WEB_DATA_STREAM' && s.webStreamData?.defaultUri);
              if (webStream && webStream.webStreamData?.defaultUri) {
                websiteUrl = webStream.webStreamData.defaultUri;
                websiteScan = await scanWebsite(websiteUrl);
              }
            } catch (streamErr) {
              console.error(`[Nightly Audit] Error fetching web data streams for scanning:`, streamErr);
            }

            ga4Data = {
              eventsLast7Days,
              conversions,
              duplicatePurchasesCount,
              eventsList,
              hasPurchaseEvent,
              hasLeadEvent,
              hasFormSubmitEvent
            };
          } catch (ga4Err) {
            console.error(`[Client ${clientId}] GA4 fetch error:`, ga4Err);
          }
        }

        if (gtmContainerId && gtmAccountId) {
          try {
            const tagmanager = google.tagmanager({ version: 'v2', auth: oauth2Client });
            const workspacesRes = await tagmanager.accounts.containers.workspaces.list({
              parent: `accounts/${gtmAccountId}/containers/${gtmContainerId}`
            });
            const workspaces = workspacesRes.data.workspace || [];
            const defaultWorkspace = workspaces[0];

            if (defaultWorkspace && defaultWorkspace.path) {
              const workspacePath = defaultWorkspace.path;
              const tagsRes = await tagmanager.accounts.containers.workspaces.tags.list({ parent: workspacePath });
              const triggersRes = await tagmanager.accounts.containers.workspaces.triggers.list({ parent: workspacePath });
              const variablesRes = await tagmanager.accounts.containers.workspaces.variables.list({ parent: workspacePath });

              const tags: GTMTag[] = (tagsRes.data.tag || []).map(t => ({
                tagId: t.tagId || '',
                name: t.name || '',
                type: t.type || '',
                firingTriggerId: t.firingTriggerId || [],
                blockingTriggerId: t.blockingTriggerId || [],
                consentSettings: t.consentSettings as Record<string, unknown> | undefined || undefined
              }));

              const triggers: GTMTrigger[] = (triggersRes.data.trigger || []).map(t => ({
                triggerId: t.triggerId || '',
                name: t.name || '',
                type: t.type || ''
              }));

              const variables: GTMVariable[] = (variablesRes.data.variable || []).map(v => ({
                variableId: v.variableId || '',
                name: v.name || '',
                type: v.type || ''
              }));

              const hasConsentModeTag = tags.some(tag => 
                tag.type === 'gcm' || 
                tag.name.toLowerCase().includes('consent') ||
                tag.name.toLowerCase().includes('cookiebot')
              );

              gtmData = {
                tags,
                triggers,
                variables,
                hasConsentModeTag
              };
            }
          } catch (gtmErr) {
            console.error(`[Client ${clientId}] GTM fetch error:`, gtmErr);
          }
        }
      }

      const industry = clientData?.industry;

      const auditSummary = await runAudit({
        clientId,
        ga4PropertyId,
        gtmContainerId,
        ga4Data,
        gtmData,
        websiteUrl,
        industry,
        websiteScan
      });

      const runRef = adminDb.collection('audit_runs').doc();
      await runRef.set({
        id: runRef.id,
        clientId,
        score: auditSummary.score,
        grade: auditSummary.grade,
        issues: auditSummary.issues,
        results: auditSummary.results,
        categoryScores: auditSummary.categoryScores,
        websiteUrl: websiteUrl || null,
        websiteScan: websiteScan || null,
        createdAt: new Date()
      });

      console.log(`Client ${clientData.name} audit run saved successfully. Score: ${auditSummary.score} (${auditSummary.grade})`);
    }

    console.log('Nightly audits completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Nightly audit script crashed:', error);
    process.exit(1);
  }
}

executeNightlyAudit();
