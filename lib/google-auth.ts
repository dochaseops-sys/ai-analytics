import { google } from 'googleapis';
import { adminDb } from './firebase-admin';

/**
 * Thrown when a client has not yet connected their Google (GTM / GA4) account.
 * Callers can `instanceof` check this to surface a friendly prompt to the user.
 */
export class GoogleAccountNotConnectedError extends Error {
  /** The clientId is stored here for server-side logging only — never send it to the client. */
  readonly clientId: string;

  constructor(clientId: string) {
    super(
      'To run an audit, please connect your Google Tag Manager and GA4 account. ' +
      'Go to Settings → Integrations and click "Connect Google Account" to get started.'
    );
    this.name = 'GoogleAccountNotConnectedError';
    this.clientId = clientId;
  }
}

const getOAuth2Client = (origin: string) => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${origin}/api/auth/callback`
  );
};

export const getAuthUrl = (clientId: string, origin: string) => {
  const oauth2Client = getOAuth2Client(origin);
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/analytics.edit',
      'https://www.googleapis.com/auth/tagmanager.readonly',
      'https://www.googleapis.com/auth/tagmanager.edit.containers',
      'https://www.googleapis.com/auth/tagmanager.edit.containerversions'
    ],
    state: clientId
  });
};

export const exchangeCodeForTokens = async (code: string, clientId: string, origin: string) => {
  const oauth2Client = getOAuth2Client(origin);
  const { tokens } = await oauth2Client.getToken(code);
  
  const credentialsRef = adminDb.collection('google_credentials').doc(clientId);
  const existingDoc = await credentialsRef.get();
  const existingData = existingDoc.exists ? existingDoc.data() : null;

  const dataToSave = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || existingData?.refreshToken || '',
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000),
    updatedAt: new Date()
  };

  await credentialsRef.set(dataToSave, { merge: true });

  // Update client document to signal that Google credentials are connected
  const clientRef = adminDb.collection('clients').doc(clientId);
  await clientRef.set({ googleConnected: true }, { merge: true });

  return dataToSave;
};

export const getValidAccessToken = async (clientId: string): Promise<string> => {
  const credentialsRef = adminDb.collection('google_credentials').doc(clientId);
  const doc = await credentialsRef.get();

  if (!doc.exists) {
    throw new GoogleAccountNotConnectedError(clientId);
  }

  const data = doc.data()!;
  const expiresAt = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);

  // If token expires in less than 5 minutes, refresh it
  if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    if (!data.refreshToken) {
      throw new Error(`Refresh token missing for client ${clientId}`);
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      refresh_token: data.refreshToken
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    const newAccessToken = credentials.access_token!;
    const newExpiresAt = credentials.expiry_date 
      ? new Date(credentials.expiry_date) 
      : new Date(Date.now() + 3600 * 1000);

    const updateData = {
      accessToken: newAccessToken,
      expiresAt: newExpiresAt,
      updatedAt: new Date()
    };

    await credentialsRef.update(updateData);
    return newAccessToken;
  }

  return data.accessToken;
};
