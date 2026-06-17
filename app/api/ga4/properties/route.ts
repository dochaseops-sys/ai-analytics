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
    const analyticsadmin = google.analyticsadmin({ version: 'v1alpha', auth: oauth2Client });

    const accountsRes = await analyticsadmin.accounts.list();
    const accounts = accountsRes.data.accounts || [];

    const properties: Array<{ id: string; name: string; accountId: string }> = [];

    for (const account of accounts) {
      const accountId = account.name?.split('/')[1];
      if (!accountId) continue;
      
      try {
        const propertiesRes = await analyticsadmin.properties.list({
          filter: `parent:accounts/${accountId}`
        });
        const accountProperties = propertiesRes.data.properties || [];
        for (const prop of accountProperties) {
          const propId = prop.name?.split('/')[1];
          if (propId) {
            properties.push({
              id: propId,
              name: prop.displayName || `Property ${propId}`,
              accountId
            });
          }
        }
      } catch (err) {
        console.error(`Error fetching properties for account ${accountId}:`, err);
      }
    }

    return NextResponse.json({ properties });
  } catch (error) {
    if (error instanceof GoogleAccountNotConnectedError) {
      console.warn(`GA4 properties: Google account not connected for client ${error.clientId}`);
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('Error fetching GA4 properties:', error);
    return NextResponse.json({ error: 'Failed to fetch GA4 properties. Please try again.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clientId, propertyId, propertyName, accountEmail } = body;

    if (!clientId || !propertyId || !propertyName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Save to ga4_properties collection
    const ga4Ref = adminDb.collection('ga4_properties').doc(clientId);
    const connectionData = {
      id: clientId,
      clientId,
      propertyId,
      propertyName,
      accountEmail: accountEmail || '',
      connectedAt: new Date()
    };

    await ga4Ref.set(connectionData);

    return NextResponse.json({ success: true, connection: connectionData });
  } catch (error) {
    console.error('Error connecting GA4 property:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
