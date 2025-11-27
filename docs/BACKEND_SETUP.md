# Backend Architecture & Setup Guide

**Document Version:** 1.0.0  
**Last Updated:** October 2025  
**Maintained by:** Plateful Engineering Team  
**Target Audience:** Backend Engineers, DevOps, Full-Stack Developers

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [System Components](#system-components)
3. [Firebase Backend Setup](#firebase-backend-setup)
4. [Vercel API Setup](#vercel-api-setup)
5. [Environment Configuration](#environment-configuration)
6. [Security & Access Control](#security--access-control)
7. [Debugging & Troubleshooting](#debugging--troubleshooting)
8. [Zero-Break Setup Checklist](#zero-break-setup-checklist)
9. [Production Deployment](#production-deployment)

---

## Architecture Overview

Plateful uses a **serverless-first architecture** combining Firebase Backend-as-a-Service (BaaS) with Azure App Service (Docker) for custom business logic.

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │   Expo React Native App (iOS/Android)                    │   │
│  │   - Expo Router (file-based routing)                     │   │
│  │   - React 19 + TypeScript                                │   │
│  │   - Local state management                               │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────┴─────────┐
                    │                  │
         ┌──────────▼────────┐    ┌───▼──────────────┐
         │  Firebase SDK     │    │  Azure API        │
         │  (Client)         │    │  (REST/HTTP)      │
         └──────────┬────────┘    └───┬──────────────┘
                    │                  │
┌───────────────────▼──────────────────▼─────────────────────────┐
│                      BACKEND LAYER                             │
│                                                                │
│  ┌─────────────────────────────┐    ┌──────────────────────┐   │
│  │   Firebase Services         │    │   Azure App Service   │   │
│  │                             │    │   (Docker Container)  │   │
│  │  • Authentication           │    │                      │   │
│  │    - Email/Password         │    │  • Custom Routes     │   │
│  │    - Google OAuth           │    │  • Business Logic    │   │
│  │                             │    │  • Integrations      │   │
│  │  • Firestore (NoSQL DB)     │    │  • Webhooks          │   │
│  │    - Real-time updates      │    │                      │   │
│  │    - Security rules         │    │  Runtime: Node 20.x  │   │
│  │                             │    │  Framework: Hono     │   │
│  │  • Cloud Storage            │    │                      │   │
│  │    - File uploads           │    │  Region: Azure       │   │
│  │    - Secure access rules    │    │  (Configurable)      │   │
│  │                             │    │                      │   │
│  │  Region: us-central1        │    │                      │   │
│  └─────────────────────────────┘    └──────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Authentication Flow:**
   ```
   Mobile App → Firebase Auth SDK → Firebase Auth Service
                                  ↓
                              ID Token (JWT)
                                  ↓
   Mobile App ← ID Token ← Firebase Auth Service
   ```

2. **Data Read/Write Flow:**
   ```
   Mobile App → Firestore SDK → Firestore Security Rules Check
                              ↓
                         Allow/Deny
                              ↓
   Mobile App ← Data ← Firestore Database
   ```

3. **Custom API Flow:**
   ```
   Mobile App → HTTP Request → Azure App Service (Docker)
                            ↓
                    Business Logic Execution
                            ↓
                    Optional Firebase Admin SDK Call
                            ↓
   Mobile App ← Response ← Azure API
   ```

---

## System Components

### 1. Firebase Services

#### **Firebase Authentication**
- **Purpose:** User identity management
- **Methods Supported:**
  - Email/Password (primary)
  - Google OAuth (iOS/Android/Web)
- **Token Type:** JWT (JSON Web Tokens)
- **Session Management:** Firebase handles token refresh automatically
- **Security:** Tokens expire after 1 hour; refresh tokens valid for 30 days

#### **Cloud Firestore**
- **Type:** NoSQL document database
- **Structure:**
  ```
  groceryLists/{listId}
    ├── name: string
    ├── ownerId: string (auth.uid)
    ├── createdAt: timestamp
    └── items: array<object>
        ├── id: string
        ├── name: string
        ├── quantity: number
        └── checked: boolean
  ```
- **Real-time:** Yes (via listeners)
- **Offline Support:** Yes (local cache)
- **Region:** `us-central1` (default)

#### **Cloud Storage**
- **Purpose:** File uploads (images, documents)
- **Bucket:** `{project-id}.appspot.com`
- **Access Control:** Rules-based (must match ownerId)
- **Max File Size:** 5MB (configurable)

### 2. Vercel API Layer

#### **Runtime Environment**
- **Node Version:** 18.x
- **Framework:** Hono (lightweight Express alternative)
- **Deployment:** Edge functions (auto-scaling)
- **Cold Start:** ~50-100ms

#### **API Structure**
```
/api
  └── health.ts         # Health check endpoint
  └── [future routes]   # Webhooks, integrations, etc.
```

#### **Purpose**
- Custom business logic not suitable for client-side
- Third-party integrations (payment processors, email services)
- Webhooks and event listeners
- Server-side Firebase Admin SDK operations

---

## Firebase Backend Setup

### Prerequisites

```bash
# Required tools
node >= 18.0.0
npm >= 9.0.0
firebase-tools >= 12.0.0
```

### Step 1: Create Firebase Project

1. **Navigate to Firebase Console:**
   ```
   https://console.firebase.google.com
   ```

2. **Create New Project:**
   - Click "Add project"
   - Project name: `plateful-mvp` (or your choice)
   - Enable Google Analytics: Optional
   - Choose Analytics location: Your region
   - Accept terms → Create Project

3. **Note Your Project ID:**
   ```
   Project ID format: plateful-mvp-a1b2c
   ```
   ⚠️ **Important:** This ID is immutable after creation

### Step 2: Enable Firebase Services

#### **Enable Authentication**

```bash
# Via Console:
# 1. Authentication → Get Started
# 2. Sign-in method → Email/Password → Enable
# 3. Sign-in method → Google → Enable
```

**For Google Sign-In:**
```
Support email: your-email@domain.com
Project public-facing name: Plateful
```

**Get OAuth Credentials:**
1. Go to Authentication → Sign-in method → Google
2. Click "Web SDK configuration"
3. Copy all three client IDs:
   - Web client ID
   - iOS client ID  
   - Android client ID

#### **Enable Firestore Database**

```bash
# Via Console:
# 1. Firestore Database → Create database
# 2. Start in production mode (we'll add rules next)
# 3. Select region: us-central1 (recommended for US-based apps)
```

⚠️ **Region Selection:**
- **Cannot be changed after creation**
- Choose closest to your primary user base
- `us-central1` (Iowa) is default and cheapest
- Multi-region available but costs more

#### **Enable Cloud Storage**

```bash
# Via Console:
# 1. Storage → Get started
# 2. Start in production mode
# 3. Location: Same as Firestore (us-central1)
```

### Step 3: Deploy Security Rules

#### **Firestore Rules** (`firestore.rules`)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper function: Check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Helper function: Check if user owns the document
    function isOwner(userId) {
      return request.auth.uid == userId;
    }
    
    // Grocery Lists
    match /groceryLists/{listId} {
      // Allow read if user owns the list
      allow read: if isAuthenticated() && isOwner(resource.data.ownerId);
      
      // Allow create if user is authenticated and sets themselves as owner
      allow create: if isAuthenticated() && isOwner(request.resource.data.ownerId);
      
      // Allow update/delete if user owns the list
      allow update, delete: if isAuthenticated() && isOwner(resource.data.ownerId);
    }
    
    // User profiles
    match /users/{userId} {
      allow read, write: if isAuthenticated() && isOwner(userId);
    }
  }
}
```

**Key Security Principles:**
- ✅ All reads/writes require authentication
- ✅ Users can only access their own data (`ownerId == auth.uid`)
- ✅ No wildcard permissions
- ✅ Explicit allow rules only

#### **Storage Rules** (`storage.rules`)

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // User uploads path: /users/{userId}/uploads/{fileName}
    match /users/{userId}/uploads/{allPaths=**} {
      // Allow read if authenticated
      allow read: if request.auth != null;
      
      // Allow write if user owns the path and file is under 5MB
      allow write: if request.auth != null 
                   && request.auth.uid == userId
                   && request.resource.size < 5 * 1024 * 1024;
    }
  }
}
```

#### **Deploy Rules**

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize (if not done)
firebase init firestore storage

# Deploy rules
firebase deploy --only firestore:rules,storage:rules

# Expected output:
# ✔ Deploy complete!
# ✔ firestore:rules
# ✔ storage:rules
```

### Step 4: Initialize Firebase in Application

#### **Client-Side Initialization** (`apps/mobile/src/config/firebase.ts`)

```typescript
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Validate configuration
const validateConfig = () => {
  const missing = Object.entries(firebaseConfig)
    .filter(([_, value]) => !value)
    .map(([key]) => key);
    
  if (missing.length > 0) {
    throw new Error(`Missing Firebase config: ${missing.join(', ')}`);
  }
};

validateConfig();

// Initialize Firebase App (singleton pattern)
let app;
try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (error) {
  console.error('[Firebase] App initialization failed:', error);
  throw error;
}

// Initialize Auth with React Native persistence
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (error) {
  // If already initialized, get existing instance
  auth = getAuth(app);
}

// Initialize Firestore
const db = getFirestore(app);

// Initialize Storage
const storage = getStorage(app);

export { app, auth, db, storage };
```

**Key Patterns:**
- ✅ **Singleton Pattern:** `getApps().length === 0` prevents duplicate initialization
- ✅ **Validation:** Check all config values before initialization
- ✅ **Error Handling:** Graceful fallback if auth already initialized
- ✅ **Persistence:** Use AsyncStorage for React Native auth persistence

---

## Vercel API Setup

### Prerequisites

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login
```

### Step 1: Configure Vercel Project

#### **vercel.json** Configuration

```json
{
  "functions": {
    "api/**/*.ts": {
      "runtime": "nodejs18.x",
      "maxDuration": 10
    }
  },
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "/api/:path*"
    }
  ]
}
```

**Configuration Options:**
- `runtime`: Node.js version (18.x recommended)
- `maxDuration`: Max execution time (10s for free tier)
- `rewrites`: URL routing rules

### Step 2: Create API Routes

#### **Health Check Endpoint** (`apps/api/api/health.ts`)

```typescript
import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'plateful-api',
    version: '1.0.0'
  });
});

export default app;
```

### Step 3: Deploy to Vercel

```bash
cd apps/api

# First time deployment
vercel

# Answer prompts:
# Set up and deploy? Yes
# Scope: Your account
# Link to existing project? No
# Project name: plateful-api
# Directory: ./
# Override settings? No

# Deploy
vercel --prod
```

### Step 4: Configure Environment Variables

```bash
# Via Vercel Dashboard:
# 1. Project Settings → Environment Variables
# 2. Add variables for Production, Preview, Development

# Required variables:
FIREBASE_PROJECT_ID=plateful-mvp-a1b2c
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@plateful-mvp.iam.gserviceaccount.com
```

**Get Firebase Admin SDK Credentials:**
```
1. Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key"
3. Save JSON file securely
4. Extract values for environment variables
```

---

## Environment Configuration

### Environment Variable Strategy

Plateful uses **three layers** of environment configuration:

1. **Client-safe variables** (Expo): `EXPO_PUBLIC_*`
2. **Server-side secrets** (Vercel): No prefix
3. **Local development**: `.env` and `.env.local` files

### Client Environment (`apps/mobile/.env`)

```bash
# ✅ Safe to expose (client-side)
EXPO_PUBLIC_FIREBASE_API_KEY=AIza...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=plateful-mvp.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=plateful-mvp
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=plateful-mvp.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123

# Google OAuth (get from Firebase Console → Authentication)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=123-abc.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=123-ios.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=123-android.apps.googleusercontent.com

# Figma Integration (optional)
FIGMA_ACCESS_TOKEN=figd_...
FIGMA_FILE_ID=YL6JUI6MAovP38M7iF7Xbw
```

⚠️ **Security Note:**
- `EXPO_PUBLIC_*` variables are **bundled into the app**
- Never put secrets here (API keys, private keys, passwords)
- Firebase API keys are safe to expose (protected by Firebase rules)

### Server Environment (`apps/api/.env.local`)

```bash
# ❌ NEVER commit these (server-only)
FIREBASE_PROJECT_ID=plateful-mvp
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMII...-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xyz@plateful-mvp.iam.gserviceaccount.com

# Third-party API keys (examples)
STRIPE_SECRET_KEY=sk_test_...
SENDGRID_API_KEY=SG....
```

### Environment Loading

#### **Expo (Metro Bundler)**
```javascript
// Loaded automatically from apps/mobile/.env
process.env.EXPO_PUBLIC_FIREBASE_API_KEY
```

#### **Vercel Functions**
```javascript
// Loaded from Vercel project environment variables
process.env.FIREBASE_PROJECT_ID
```

---

## Security & Access Control

### Authentication Flow

```typescript
// 1. User signs in (client-side)
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './config/firebase';

const signIn = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Get ID token (JWT)
    const idToken = await user.getIdToken();
    
    console.log('Signed in:', user.uid);
    return user;
  } catch (error) {
    console.error('Sign-in error:', error.code, error.message);
    throw error;
  }
};
```

### Data Access Patterns

#### **Firestore Queries (Client)**

```typescript
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from './config/firebase';

// Get current user's grocery lists
const getUserLists = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  
  const listsRef = collection(db, 'groceryLists');
  const q = query(listsRef, where('ownerId', '==', user.uid));
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};
```

#### **Firestore Write (Client)**

```typescript
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './config/firebase';

const createList = async (name: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  
  const listRef = await addDoc(collection(db, 'groceryLists'), {
    name,
    ownerId: user.uid,  // ✅ Must match auth.uid for security rules
    createdAt: serverTimestamp(),
    items: []
  });
  
  return listRef.id;
};
```

### Security Best Practices

#### ✅ **Do's**
- Always validate `auth.currentUser` before data operations
- Use `serverTimestamp()` for created/updated timestamps
- Set `ownerId` to `auth.uid` on document creation
- Query with `where('ownerId', '==', user.uid)` for user-specific data
- Use Firebase Security Rules as primary authorization layer

#### ❌ **Don'ts**
- Never trust client-provided `ownerId` without verification
- Don't store sensitive data in Firestore (use Cloud Functions + external storage)
- Avoid wildcard allow rules in security rules
- Don't hardcode credentials in source code
- Never commit `.env` files to git

---

## Debugging & Troubleshooting

### Common Issues & Solutions

#### **Issue 1: "Firebase App Not Initialized"**

**Symptoms:**
```
Error: Firebase: No Firebase App '[DEFAULT]' has been created
```

**Cause:**  
Firebase `initializeApp()` not called or called multiple times

**Solution:**
```typescript
// Use singleton pattern
import { getApps, getApp, initializeApp } from 'firebase/app';

const app = getApps().length === 0 
  ? initializeApp(firebaseConfig) 
  : getApp();
```

#### **Issue 2: "Auth Component Not Registered"**

**Symptoms:**
```
Error: Firebase: Error (auth/component-not-registered)
```

**Cause:**  
Trying to use `getAuth()` before `initializeAuth()` with React Native persistence

**Solution:**
```typescript
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});
```

#### **Issue 3: Firestore Permission Denied**

**Symptoms:**
```
Error: Missing or insufficient permissions
```

**Cause:**  
Security rules blocking the operation

**Debugging Steps:**
```bash
# 1. Check Firestore Rules tab in Firebase Console
# 2. Enable "Rules Playground" to test rules
# 3. Verify auth.uid matches document ownerId

# Example debug query:
const user = auth.currentUser;
console.log('Auth UID:', user?.uid);

const docRef = doc(db, 'groceryLists', listId);
const docSnap = await getDoc(docRef);
console.log('Document ownerId:', docSnap.data()?.ownerId);
```

**Fix:**  
Ensure document `ownerId` field matches `auth.uid`:
```typescript
await addDoc(collection(db, 'groceryLists'), {
  ownerId: auth.currentUser.uid,  // ✅ Correct
  // ...other fields
});
```

#### **Issue 4: Storage Region Mismatch**

**Symptoms:**
```
Error: The operation is not supported in this region
```

**Cause:**  
Storage bucket created in different region than expected

**Solution:**
```typescript
import { getStorage } from 'firebase/storage';

// Specify bucket explicitly
const storage = getStorage(app, 'gs://plateful-mvp.appspot.com');
```

#### **Issue 5: Vercel Function Timeout**

**Symptoms:**
```
Error: Function execution timed out
```

**Cause:**  
Function exceeds max duration (10s on free tier)

**Solutions:**
1. Optimize database queries (add indexes)
2. Use `Promise.all()` for parallel operations
3. Move long-running tasks to background jobs
4. Upgrade to Pro plan (60s max duration)

### Debug Logging

#### **Enable Firebase Debug Logs**

```typescript
// In apps/mobile/src/config/firebase.ts
import { setLogLevel } from 'firebase/app';

if (__DEV__) {
  setLogLevel('debug');
}
```

#### **Vercel Function Logs**

```bash
# View real-time logs
vercel logs --follow

# View logs for specific deployment
vercel logs [deployment-url]
```

---

## Zero-Break Setup Checklist

Use this checklist to ensure a clean, error-free backend setup.

### Pre-Setup Validation

- [ ] Node.js >= 18.0.0 installed (`node --version`)
- [ ] npm >= 9.0.0 installed (`npm --version`)
- [ ] Firebase CLI installed (`firebase --version`)
- [ ] Vercel CLI installed (`vercel --version`)
- [ ] Git repository initialized
- [ ] `.env` files in `.gitignore`

### Firebase Setup

- [ ] Firebase project created
- [ ] Project ID noted and verified
- [ ] Authentication enabled (Email/Password + Google)
- [ ] Google OAuth client IDs obtained (Web, iOS, Android)
- [ ] Firestore database created in `us-central1`
- [ ] Cloud Storage enabled in same region
- [ ] Security rules deployed (`firebase deploy --only firestore:rules,storage:rules`)
- [ ] Rules tested in Firebase Console Rules Playground

### Environment Configuration

- [ ] `apps/mobile/.env` created from `.env.example`
- [ ] All `EXPO_PUBLIC_*` variables filled
- [ ] Firebase config values copied from console
- [ ] Google OAuth client IDs added
- [ ] `apps/api/.env.local` created (if using Firebase Admin SDK)
- [ ] Service account JSON downloaded and values extracted

### Application Setup

- [ ] Dependencies installed (`npm install` from root)
- [ ] Mobile app builds without errors (`cd apps/mobile && npm run build`)
- [ ] TypeScript compiles without errors (`npm run type-check`)
- [ ] Firebase initialization logs show success
- [ ] No duplicate Firebase app initialization errors

### Vercel Setup

- [ ] Vercel project created
- [ ] Project linked (`vercel link`)
- [ ] Environment variables configured in Vercel dashboard
- [ ] Test deployment successful (`vercel`)
- [ ] Health check endpoint accessible (`/api/health`)
- [ ] Production deployment successful (`vercel --prod`)

### Functional Testing

- [ ] User sign-up flow works
- [ ] User sign-in flow works
- [ ] Google OAuth works (if implemented)
- [ ] Firestore read/write operations succeed
- [ ] Security rules properly restrict unauthorized access
- [ ] Storage upload/download works
- [ ] Vercel API responds to requests

### Post-Setup Validation

- [ ] No console errors in mobile app
- [ ] Firebase logs show clean initialization
- [ ] Vercel logs show successful function executions
- [ ] Security rules tested with multiple user scenarios
- [ ] All environment variables verified
- [ ] Documentation updated with project-specific IDs

---

## Production Deployment

### Pre-Deployment Checklist

#### **Security Audit**

- [ ] All `.env` files in `.gitignore`
- [ ] No hardcoded credentials in source code
- [ ] Firestore security rules in production mode
- [ ] Storage security rules tested
- [ ] API endpoints require authentication where needed
- [ ] Rate limiting configured (if applicable)
- [ ] CORS configured properly

#### **Performance Optimization**

- [ ] Firestore indexes created for common queries
- [ ] Storage files compressed before upload
- [ ] Images optimized (WebP format, proper sizing)
- [ ] Vercel functions use optimal bundle sizes
- [ ] Unnecessary logs removed from production builds

#### **Monitoring Setup**

- [ ] Firebase Analytics enabled
- [ ] Crashlytics configured (optional)
- [ ] Vercel Analytics enabled
- [ ] Error tracking configured (Sentry, etc.)
- [ ] Performance monitoring enabled

### Deployment Commands

#### **Firebase Rules**

```bash
# Deploy production rules
firebase deploy --only firestore:rules,storage:rules --project plateful-mvp
```

#### **Vercel API**

```bash
cd apps/api

# Production deployment
vercel --prod

# Verify deployment
curl https://your-domain.vercel.app/api/health
```

#### **Mobile App**

```bash
cd apps/mobile

# Build production app
eas build --platform all

# Submit to stores
eas submit --platform all
```

### Post-Deployment Validation

- [ ] API health check returns 200 OK
- [ ] Firebase services respond correctly
- [ ] Mobile app authenticates successfully
- [ ] Data reads/writes work in production
- [ ] No unexpected errors in logs
- [ ] Performance metrics within acceptable range

---

## Additional Resources

### Documentation Links

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Vercel Documentation](https://vercel.com/docs)
- [Expo Documentation](https://docs.expo.dev)
- [React Native Firebase](https://rnfirebase.io)

### Internal Resources

- `README.md` - Main project documentation
- `FIGMA_INTEGRATION.md` - Design token sync guide
- `AUTH_SCREENS_GUIDE.md` - Authentication UI guide
- `FIREBASE_VERIFICATION.md` - Firebase setup verification

### Support Channels

- **Engineering Team:** Slack #plateful-eng
- **DevOps:** Slack #plateful-devops
- **Oncall:** PagerDuty rotation

---

**Document Maintained by:** Plateful Backend Team  
**Next Review Date:** January 2026  
**Feedback:** Create a JIRA ticket or ping #plateful-eng

---

*This document follows Meta Engineering Documentation Standards v2.1*
