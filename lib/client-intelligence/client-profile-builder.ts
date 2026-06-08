import { adminDb } from '@/lib/firebase-admin';
import { crawlWebsite } from './website-crawler';
import { profileWebsiteSnapshot } from './website-profiler';
import { ClientProfile, WebsiteSnapshot, clientProfileSchema } from './types';

type BuildInput = {
  clientId: string;
  websiteUrl?: string;
  maxPages?: number;
  maxDepth?: number;
  refreshCrawl?: boolean;
};

export async function saveWebsiteSnapshot(snapshot: WebsiteSnapshot) {
  const ref = adminDb.collection('website_snapshots').doc();
  const payload = { ...snapshot, id: ref.id, createdAt: new Date() };
  await ref.set(payload);
  return payload as WebsiteSnapshot;
}

export async function getLatestWebsiteSnapshot(clientId: string): Promise<WebsiteSnapshot | undefined> {
  const snap = await adminDb.collection('website_snapshots')
    .where('clientId', '==', clientId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  if (snap.empty) return undefined;
  return snap.docs[0].data() as WebsiteSnapshot;
}

export async function getClientProfile(clientId: string): Promise<ClientProfile | undefined> {
  const doc = await adminDb.collection('client_profiles').doc(clientId).get();
  if (!doc.exists) return undefined;
  return clientProfileSchema.parse(doc.data());
}

export async function buildClientProfile(input: BuildInput): Promise<{ profile: ClientProfile; snapshot: WebsiteSnapshot }> {
  const clientDoc = await adminDb.collection('clients').doc(input.clientId).get();
  const client = clientDoc.exists ? clientDoc.data() : undefined;
  const websiteUrl = input.websiteUrl || client?.websiteUrl || client?.url || client?.domain;
  if (!websiteUrl) throw new Error('Missing websiteUrl. Add a website URL to the client or pass one in the request.');

  let snapshot = input.refreshCrawl === false ? await getLatestWebsiteSnapshot(input.clientId) : undefined;
  if (!snapshot) {
    snapshot = await saveWebsiteSnapshot(await crawlWebsite({
      clientId: input.clientId,
      websiteUrl,
      maxPages: input.maxPages,
      maxDepth: input.maxDepth
    }));
  }

  const profileBase = await profileWebsiteSnapshot(input.clientId, snapshot);
  const now = new Date();
  const profile: ClientProfile = clientProfileSchema.parse({
    ...profileBase,
    id: input.clientId,
    createdAt: now,
    updatedAt: now
  });

  await adminDb.collection('client_profiles').doc(input.clientId).set(profile, { merge: true });
  return { profile, snapshot };
}
