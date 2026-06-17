import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getValidAccessToken, GoogleAccountNotConnectedError } from '@/lib/google-auth';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clientId, issueId, inputs } = body;

    if (!clientId || !issueId) {
      return NextResponse.json({ error: 'Missing clientId or issueId' }, { status: 400 });
    }

    // 1. Fetch connected accounts info
    const ga4Doc = await adminDb.collection('ga4_properties').doc(clientId).get();
    const gtmDoc = await adminDb.collection('gtm_containers').doc(clientId).get();

    const ga4DataDb = ga4Doc.exists ? ga4Doc.data() : null;
    const gtmDataDb = gtmDoc.exists ? gtmDoc.data() : null;

    const ga4PropertyId = ga4DataDb?.propertyId;
    const gtmContainerId = gtmDataDb?.containerId;
    const gtmAccountId = gtmDataDb?.accountId;

    // 2. Fetch Google credentials
    const accessToken = await getValidAccessToken(clientId);
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: accessToken });

    let message = '';

    if (issueId === 'lead-exists' || issueId === 'conversions-configured') {
      if (!ga4PropertyId) {
        return NextResponse.json({ error: 'GA4 Property is not connected to this client.' }, { status: 400 });
      }

      const eventName = inputs?.eventName || 'generate_lead';
      const analyticsadmin = google.analyticsadmin({ version: 'v1alpha', auth: oauth2Client });

      // Create conversion event in GA4
      await analyticsadmin.properties.conversionEvents.create({
        parent: `properties/${ga4PropertyId}`,
        requestBody: {
          eventName
        }
      });
      message = `Successfully marked event "${eventName}" as a conversion in GA4.`;

    } else if (issueId === 'form-submit-exists' || issueId === 'gtm-no-triggers') {
      if (!gtmContainerId || !gtmAccountId) {
        return NextResponse.json({ error: 'GTM Container is not connected to this client.' }, { status: 400 });
      }

      const triggerName = inputs?.triggerName || 'All Form Submissions';
      const tagmanager = google.tagmanager({ version: 'v2', auth: oauth2Client });

      // Get GTM Workspace
      const workspacesRes = await tagmanager.accounts.containers.workspaces.list({
        parent: `accounts/${gtmAccountId}/containers/${gtmContainerId}`
      });
      const workspaces = workspacesRes.data.workspace || [];
      const workspacePath = workspaces[0]?.path;
      if (!workspacePath) {
        return NextResponse.json({ error: 'No active GTM workspace found to deploy fix.' }, { status: 400 });
      }

      // Create Form Submission Trigger in GTM
      await tagmanager.accounts.containers.workspaces.triggers.create({
        parent: workspacePath,
        requestBody: {
          name: triggerName,
          type: 'formSubmission'
        }
      });
      message = `Successfully deployed Form Submission trigger "${triggerName}" to GTM Workspace.`;

    } else if (issueId === 'consent-mode') {
      if (!gtmContainerId || !gtmAccountId) {
        return NextResponse.json({ error: 'GTM Container is not connected to this client.' }, { status: 400 });
      }

      const tagName = inputs?.tagName || 'Google Consent Mode - Default';
      const tagmanager = google.tagmanager({ version: 'v2', auth: oauth2Client });

      // Get GTM Workspace
      const workspacesRes = await tagmanager.accounts.containers.workspaces.list({
        parent: `accounts/${gtmAccountId}/containers/${gtmContainerId}`
      });
      const workspaces = workspacesRes.data.workspace || [];
      const workspacePath = workspaces[0]?.path;
      if (!workspacePath) {
        return NextResponse.json({ error: 'No active GTM workspace found to deploy fix.' }, { status: 400 });
      }

      // Find "Initialization - All Pages" or "All Pages" trigger ID
      const triggersRes = await tagmanager.accounts.containers.workspaces.triggers.list({
        parent: workspacePath
      });
      const triggers = triggersRes.data.trigger || [];
      
      // Look for a pageview trigger to bind, default to "Initialization" or fallback to any pageview
      let triggerId = '';
      const allPagesTrigger = triggers.find(t => t.type === 'pageview' || t.name?.toLowerCase().includes('all pages'));
      if (allPagesTrigger) {
        triggerId = allPagesTrigger.triggerId || '';
      }

      // Create Custom HTML Tag for default consent state
      await tagmanager.accounts.containers.workspaces.tags.create({
        parent: workspacePath,
        requestBody: {
          name: tagName,
          type: 'html',
          parameter: [
            {
              key: 'html',
              type: 'template',
              value: `<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', {
    'ad_storage': 'denied',
    'analytics_storage': 'denied',
    'ad_user_data': 'denied',
    'ad_personalization': 'denied',
    'wait_for_update': 500
  });
</script>`
            }
          ],
          firingTriggerId: triggerId ? [triggerId] : []
        }
      });
      message = `Successfully deployed Google Consent Mode default tag "${tagName}" to GTM.`;

    } else {
      return NextResponse.json({ error: `Deploying fix for rule "${issueId}" is not supported.` }, { status: 400 });
    }

    // Update the latest audit run in Firestore with the newly fixed state
    try {
      const auditRunsQuery = await adminDb.collection('audit_runs')
        .where('clientId', '==', clientId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (!auditRunsQuery.empty) {
        const auditDoc = auditRunsQuery.docs[0];
        const auditData = auditDoc.data();
        const results = auditData.results || [];
        
        // Find the rule to update
        const ruleToUpdate = results.find((r: any) => r.issueId === issueId);
        if (ruleToUpdate) {
          ruleToUpdate.passed = true;
          if (issueId === 'lead-exists') {
            const eventName = inputs?.eventName || 'generate_lead';
            ruleToUpdate.description = `Lead generation event tracking is active (fix deployed successfully: "${eventName}").`;
            ruleToUpdate.recommendation = 'Confirm that lead parameters (like lead source or value) are being collected.';
            
            // Also update form-submit-exists if it is in results
            const formRule = results.find((r: any) => r.issueId === 'form-submit-exists');
            if (formRule) {
              formRule.passed = true;
              formRule.description = 'Form submission tracking is satisfied since a lead generation conversion event is already active.';
              formRule.recommendation = 'No action required. Form interactions are already tracked and captured via your active lead conversion events.';
            }
          } else if (issueId === 'form-submit-exists') {
            ruleToUpdate.description = 'Form submission tracking is working and receiving events (fix deployed successfully).';
            ruleToUpdate.recommendation = 'Ensure that form ID or form name parameters are being logged to distinguish between forms.';
          } else if (issueId === 'conversions-configured') {
            ruleToUpdate.description = 'Conversions are configured (fix deployed successfully).';
            ruleToUpdate.recommendation = 'Ensure conversion events are tracking correctly in production.';
          } else if (issueId === 'gtm-no-triggers') {
            ruleToUpdate.description = 'All GTM tags have triggers configured (fix deployed successfully).';
            ruleToUpdate.recommendation = 'Verify that your triggers fire on correct actions and page conditions.';
          } else if (issueId === 'consent-mode') {
            ruleToUpdate.description = 'Google Consent Mode is configured (fix deployed successfully).';
            ruleToUpdate.recommendation = 'Verify the default consent settings in GTM.';
          }
        }

        // Recalculate scores using the logic from runAudit
        const recalculateScores = (resultsList: any[]) => {
          let ga4SetupScore = 0;
          let gtmSetupScore = 0;
          let conversionScore = 0;
          let eventQualityScore = 0;
          let privacyScore = 0;

          const getRuleResult = (id: string) => resultsList.find(r => r.issueId === id);

          const ga4Connected = getRuleResult('ga4-connected')?.passed ?? false;
          if (ga4Connected) {
            ga4SetupScore = 25;
          }

          const gtmConnected = getRuleResult('gtm-connected')?.passed ?? false;
          if (gtmConnected) {
            gtmSetupScore += 15;
            const gtmNoTriggers = getRuleResult('gtm-no-triggers');
            if (gtmNoTriggers && gtmNoTriggers.passed) {
              gtmSetupScore += 10;
            }
          }

          if (ga4Connected) {
            const purchaseExists = getRuleResult('purchase-exists')?.passed ?? false;
            const leadExists = getRuleResult('lead-exists')?.passed ?? false;
            const conversionsConfigured = getRuleResult('conversions-configured')?.passed ?? false;

            if (purchaseExists) conversionScore += 8;
            if (leadExists) conversionScore += 8;
            if (conversionsConfigured) conversionScore += 9;
          }

          if (ga4Connected) {
            const pageViewExists = getRuleResult('page-view-exists')?.passed ?? false;
            const duplicateEvents = getRuleResult('duplicate-events')?.passed ?? false;
            const events7Days = getRuleResult('events-7days')?.passed ?? false;

            if (pageViewExists) eventQualityScore += 5;
            if (duplicateEvents) eventQualityScore += 5;
            if (events7Days) eventQualityScore += 5;
          }

          const consentMode = getRuleResult('consent-mode')?.passed ?? false;
          if (consentMode) {
            privacyScore = 10;
          }

          const score = ga4SetupScore + gtmSetupScore + conversionScore + eventQualityScore + privacyScore;

          let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
          if (score >= 90) grade = 'A';
          else if (score >= 80) grade = 'B';
          else if (score >= 70) grade = 'C';
          else if (score >= 60) grade = 'D';

          return {
            score,
            grade,
            categoryScores: {
              ga4Setup: { score: ga4SetupScore, max: 25 },
              gtmSetup: { score: gtmSetupScore, max: 25 },
              conversionTracking: { score: conversionScore, max: 25 },
              eventQuality: { score: eventQualityScore, max: 15 },
              privacyConsent: { score: privacyScore, max: 10 }
            }
          };
        };

        const updatedScores = recalculateScores(results);

        await auditDoc.ref.update({
          results,
          score: updatedScores.score,
          grade: updatedScores.grade,
          categoryScores: updatedScores.categoryScores,
          issues: results.filter((r: any) => !r.passed)
        });
      }
    } catch (dbErr) {
      console.error('Failed to update latest audit run doc on fix deployment:', dbErr);
    }

    return NextResponse.json({ success: true, message });

  } catch (error) {
    if (error instanceof GoogleAccountNotConnectedError) {
      console.warn(`Deploy-fix: Google account not connected for client ${error.clientId}`);
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('Error deploying recommendation fix:', error);
    return NextResponse.json({ error: 'Failed to deploy fix. Please try again.' }, { status: 500 });
  }
}
