import * as admin from 'firebase-admin';

const getFirebaseAdmin = () => {
  if (admin.apps.length > 0) {
    return { app: admin.app(), isNew: false };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  if (projectId && clientEmail && privateKey) {
    return {
      app: admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      }),
      isNew: true
    };
  }

  // Fallback for local emulator or development environment
  return {
    app: admin.initializeApp({
      projectId: projectId || 'tracking-health-ai-audit',
    }),
    isNew: true
  };
};

const { app: adminApp, isNew } = getFirebaseAdmin();
const adminDb = admin.firestore(adminApp);
if (isNew) {
  try {
    adminDb.settings({ ignoreUndefinedProperties: true });
  } catch (e) {
    // Ignore if settings were already configured
  }
}
const adminAuth = admin.auth(adminApp);

export { adminApp, adminDb, adminAuth };
