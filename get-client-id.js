const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
};
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
db.collection('clients').limit(1).get().then(snap => {
  snap.forEach(doc => console.log('Found Client ID:', doc.id));
}).catch(console.error);
