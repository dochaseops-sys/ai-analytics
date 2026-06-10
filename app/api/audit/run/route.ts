import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getValidAccessToken } from '@/lib/google-auth';
import { adminDb } from '@/lib/firebase-admin';
import { runAudit } from '@/lib/audit-engine';
import { GA4AuditData, GTMAuditData, GTMTag, GTMTrigger, GTMVariable } from '@/lib/audit-engine/types';
import { scanWebsite } from '@/lib/website-scanner';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clientId } = body;

    if (!clientId) {
      return NextResponse.json({ error: 'Missing clientId parameter' }, { status: 400 });
    }

    // 1. Fetch connected accounts info
    const clientDoc = await adminDb.collection('clients').doc(clientId).get();
    const ga4Doc = await adminDb.collection('ga4_properties').doc(clientId).get();
    const gtmDoc = await adminDb.collection('gtm_containers').doc(clientId).get();

    const clientDataDb = clientDoc.exists ? clientDoc.data() : null;
    const ga4DataDb = ga4Doc.exists ? ga4Doc.data() : null;
    const gtmDataDb = gtmDoc.exists ? gtmDoc.data() : null;

    let industry = clientDataDb?.industry;
    let ga4PropertyId = ga4DataDb?.propertyId;
    let gtmContainerId = gtmDataDb?.containerId;
    let gtmAccountId = gtmDataDb?.accountId;

    let ga4Data: GA4AuditData | undefined;
    let gtmData: GTMAuditData | undefined;

    // 2. Fetch Google credentials if connected
    let accessToken: string | null = null;
    try {
      accessToken = await getValidAccessToken(clientId);
    } catch (err) {
      console.warn('Google Credentials not linked or error retrieving them:', err);
    }

    let websiteUrl: string | undefined;
    let websiteScan: any = undefined;

    if (accessToken) {
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });

      // Fetch GA4 Analytics Data & Admin API
      if (ga4PropertyId) {
        try {
          const analyticsdata = google.analyticsdata({ version: 'v1beta', auth: oauth2Client });
          const analyticsadmin = google.analyticsadmin({ version: 'v1alpha', auth: oauth2Client });

          // A. Get 7 Days Event List
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
          // B. Get Configured Conversions
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

          // C. Get Duplicate Purchases (look back 30 days)
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
            // Count unique transaction IDs with count > 1
            duplicatePurchasesCount = dupRows.filter(r => {
              const count = parseInt(r.metricValues?.[0]?.value || '0', 10);
              const txId = r.dimensionValues?.[1]?.value;
              return count > 1 && !!txId && txId !== '(not set)';
            }).length;
          } catch (dupErr) {
            console.error('Error fetching duplicate purchases:', dupErr);
          }

          // D. Fetch Web Data Streams to get websiteUrl and scan the website
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
            console.error('Error fetching web data streams for scanning:', streamErr);
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
          console.error('Error fetching GA4 data:', ga4Err);
        }
      }

      // Fetch GTM Container Setup
      if (gtmContainerId && gtmAccountId) {
        try {
          const tagmanager = google.tagmanager({ version: 'v2', auth: oauth2Client });

          // Get workspaces list and find the default/active workspace
          const workspacesRes = await tagmanager.accounts.containers.workspaces.list({
            parent: `accounts/${gtmAccountId}/containers/${gtmContainerId}`
          });
          const workspaces = workspacesRes.data.workspace || [];
          const defaultWorkspace = workspaces[0]; // Fetch first workspace

          if (defaultWorkspace && defaultWorkspace.path) {
            const workspacePath = defaultWorkspace.path;

            // Fetch tags, triggers, variables
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

            // Consent Mode detection: checks for tags of type 'gcm' (Google Consent Mode) or tags that contain "consent"
            const hasConsentModeTag = tags.some(tag => 
              tag.type === 'gcm' || 
              tag.name.toLowerCase().includes('consent') ||
              tag.name.toLowerCase().includes('cookiebot') ||
              tag.name.toLowerCase().includes('onetrust')
            );

            gtmData = {
              tags,
              triggers,
              variables,
              hasConsentModeTag
            };
          }
        } catch (gtmErr) {
          console.error('Error fetching GTM data:', gtmErr);
        }
      }
    }

    // 3. Execute deterministic audit engine
    const auditContext = {
      clientId,
      ga4PropertyId,
      gtmContainerId,
      ga4Data,
      gtmData,
      websiteUrl,
      industry,
      websiteScan
    };

    const auditSummary = await runAudit(auditContext);

    // 4. Save audit run to Firestore
    const auditRunsRef = adminDb.collection('audit_runs').doc();
    const auditData = {
      id: auditRunsRef.id,
      clientId,
      score: auditSummary.score,
      grade: auditSummary.grade,
      issues: auditSummary.issues,
      results: auditSummary.results, // store all results for trend and detail lookup
      categoryScores: auditSummary.categoryScores,
      websiteUrl: websiteUrl || null,
      websiteScan: websiteScan || null,
      createdAt: new Date()
    };

    await auditRunsRef.set(auditData);

    return NextResponse.json({ success: true, auditRun: auditData });
  } catch (error) {
    console.error('Error running audit:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
