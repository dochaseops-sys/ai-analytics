import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getValidAccessToken, GoogleAccountNotConnectedError } from '@/lib/google-auth';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');

  if (!clientId) {
    return NextResponse.json({ error: 'Missing clientId parameter' }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(clientId);
    
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const tagmanager = google.tagmanager({ version: 'v2', auth: oauth2Client });

    const accountsRes = await tagmanager.accounts.list();
    const accounts = accountsRes.data.account || [];

    const containers: Array<{ id: string; name: string; accountId: string; publicId: string }> = [];

    for (const account of accounts) {
      const accountId = account.accountId;
      if (!accountId) continue;

      try {
        const containersRes = await tagmanager.accounts.containers.list({
          parent: `accounts/${accountId}`
        });
        const accountContainers = containersRes.data.container || [];
        for (const container of accountContainers) {
          if (container.containerId) {
            containers.push({
              id: container.containerId,
              name: container.name || `Container ${container.containerId}`,
              accountId,
              publicId: container.publicId || ''
            });
          }
        }
      } catch (err) {
        console.error(`Error fetching GTM containers for account ${accountId}:`, err);
      }
    }

    return NextResponse.json({ containers });
  } catch (error) {
    if (error instanceof GoogleAccountNotConnectedError) {
      console.warn(`GTM containers: Google account not connected for client ${error.clientId}`);
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('Error fetching GTM containers:', error);
    return NextResponse.json({ error: 'Failed to fetch GTM containers. Please try again.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clientId, accountId, containerId, containerName } = body;

    if (!clientId || !accountId || !containerId || !containerName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const gtmRef = adminDb.collection('gtm_containers').doc(clientId);
    const connectionData = {
      id: clientId,
      clientId,
      accountId,
      containerId,
      containerName,
      connectedAt: new Date()
    };

    await gtmRef.set(connectionData);

    return NextResponse.json({ success: true, connection: connectionData });
  } catch (error) {
    console.error('Error connecting GTM container:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
