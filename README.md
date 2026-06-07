# Tracking Health AI

Tracking Health AI is a production-quality SaaS application designed for marketers, agencies, and ad operations teams to audit Google Analytics 4 (GA4) and Google Tag Manager (GTM) implementations. It runs deterministic audit rules to score tracking health and utilizes Gemini 2.5 Flash to generate natural language explanations and actionable recommendations.

---

## Technical Stack
- **Frontend/Backend:** Next.js 15 (App Router), TypeScript, TailwindCSS, shadcn/ui
- **Database & Authentication:** Firebase Firestore & Firebase Auth (Google Sign-In)
- **AI Engine:** Gemini 2.5 Flash
- **API Integrations:** Google Analytics Data API, Google Tag Manager API, Google Analytics Admin API
- **Scheduling:** GitHub Actions (Nightly Scheduled Workflows)
- **Exporting:** Server-side PDF generation (`pdfkit`)
- **Hosting:** Vercel (Free Plan)

---

## Core Features
1. **Deterministic Audit Engine:** Standalone, pluggable architecture under `/lib/audit-engine` containing 10 core checks:
   - GA4 property connected
   - GTM container connected
   - Purchase event exists in history
   - Lead event tracking active
   - Form submit tracking active
   - Unique purchase transaction checks (duplicate protection)
   - Google Consent Mode configuration validation
   - Event activity in the last 7 days
   - GA4 conversion configurations
   - GTM tags without firing triggers
2. **AI Investigation Panel:** A conversational chat interface grounded strictly in audit results and client context.
3. **Weekly Client Reports:** Direct exports of weekly reports as clean print-friendly white layout PDFs.
4. **Nightly Audits:** Automation of scans across all clients via GitHub Actions cron jobs (no Cloud Functions required).
5. **Secure RBAC & Tenant Isolation:** Granular Firestore rules (`firestore.rules`) defining `owner`, `admin`, and `viewer` permissions.

---

## Setup Instructions

### 1. Google Cloud OAuth Setup
To read GA4 properties and GTM containers, you must configure a Google OAuth client:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a Google Cloud Project.
3. Search for and enable the following APIs:
   - **Google Analytics Admin API**
   - **Google Analytics Data API**
   - **Google Tag Manager API**
4. Go to **APIs & Services > Credentials** and configure your **OAuth consent screen** (user type: External, scopes: `.../auth/analytics.edit`, `.../auth/tagmanager.edit.containers`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`).
5. Create an **OAuth 2.0 Client ID** (Application type: Web application).
6. Set the **Authorized redirect URIs**:
   - For local development: `http://localhost:3000/api/auth/callback`
   - For production: `https://your-app.vercel.app/api/auth/callback`
7. Save the **Client ID** and **Client Secret**.

### 2. Firebase Console Setup
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Open the `tracking-health-ai-audit` project.
3. Enable **Authentication** and activate the **Google sign-in provider**.
4. Go to **Firestore Database** and create a database instance in production mode.
5. In Project Settings, generate a new **Private Key** under **Service Accounts** and save it.
6. Deploy Firestore security rules using Firebase CLI:
   ```bash
   npx -y firebase-tools@latest deploy --only firestore:rules
   ```

### 3. Environment Variables
Create a `.env.local` file in your root directory and add the following keys:

```env
# Client-side (Public) Firebase Keys
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=tracking-health-ai-audit
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id

# Server-side (Private) Firebase Admin Keys
FIREBASE_PROJECT_ID=tracking-health-ai-audit
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@tracking-health-ai-audit.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQ..."

# Google OAuth Credentials
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Gemini AI Key
GEMINI_API_KEY=your_gemini_api_key
```

---

## Local Development
Install dependencies and run the local development server:
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the portal.

---

## Vercel Deployment (Free Plan)
Deploy the application with one click to Vercel:
1. Push your repository to GitHub.
2. Link your repository in [Vercel](https://vercel.com/).
3. Add all the environment variables listed in Section 3 under **Environment Variables** in your Vercel Project Settings.
4. Click **Deploy**.

---

## GitHub Actions Nightly Workflow
To automate the nightly audits:
1. Go to your GitHub repository **Settings > Secrets and variables > Actions**.
2. Add the following repository secrets matching your environment values:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (ensure you preserve raw newlines in this secret)
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GEMINI_API_KEY`
3. The nightly cron defined in `.github/workflows/nightly-audit.yml` runs daily at midnight UTC, pulling client connections from Firestore, refreshing access tokens, executing scans, and storing results.
