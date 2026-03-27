# Firebase User Authentication Setup Guide 🔐

This guide will help you set up user authentication and cloud storage for the Pokemon TCG Analysis website.

## Features Implemented ✨

- ✅ **User Authentication** (Email/Password + Google Sign-in)
- ✅ **Card Collection Tracking** (Mark cards as "owned")
- ✅ **Deck Building & Saving** (Sync across devices)
- ✅ **Wishlist** (Track cards you want)
- ✅ **User Profile** (Stats, settings)
- ✅ **Cloud Sync** (All data stored in Firestore)

---

## Step 1: Create Firebase Project 🔥

1. Go to https://console.firebase.google.com/
2. Click **"Add project"** or **"Create a project"**
3. **Project name:** `Pokemon TCG Analysis` (or any name you like)
4. **Google Analytics:** Optional (you can disable it)
5. Click **"Create project"** and wait for it to finish

---

## Step 2: Add Web App to Firebase 🌐

1. In your Firebase project dashboard, click the **Web icon** `</>`
2. **App nickname:** `TCG Analysis Web`
3. **DO NOT** check "Also set up Firebase Hosting" (we use GitHub Pages)
4. Click **"Register app"**
5. You'll see a config object like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyD...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456"
};
```

6. **COPY THIS CONFIG** - you'll need it in Step 4

---

## Step 3: Enable Authentication Methods 🔑

### Enable Email/Password:
1. In Firebase Console, click **"Authentication"** in the left sidebar
2. Click **"Get started"** (if first time)
3. Go to **"Sign-in method"** tab
4. Click on **"Email/Password"**
5. **Enable** the first toggle (Email/Password)
6. Click **"Save"**

### Enable Google Sign-in:
1. Still in **"Sign-in method"** tab
2. Click on **"Google"**
3. **Enable** the toggle
4. Select a **support email** (your email)
5. Click **"Save"**

---

## Step 4: Enable Firestore Database 📊

1. In Firebase Console, click **"Firestore Database"** in the left sidebar
2. Click **"Create database"**
3. **Start in production mode** (we'll add security rules next)
4. Choose a **location** (e.g., `eur3` for Europe)
5. Click **"Enable"**

### Set Firestore Security Rules:
1. In Firestore, click the **"Rules"** tab
2. Replace the rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection - users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // User's decks subcollection
      match /decks/{deckId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

3. Click **"Publish"**

---

## Step 5: Add Credentials in the Correct File 📝

This project reads credentials from `js/firebase-credentials.js` (NOT from `js/firebase-config.js`).

1. Open the file: `js/firebase-credentials.js`
2. Replace all `PLACEHOLDER_*` values with your real Firebase Web App config
3. Add your Google OAuth client ID to `window.GOOGLE_CLIENT_ID`
4. Save the file

Expected local format:

```javascript
window.FIREBASE_CREDS = {
   apiKey: "AIzaSy...",
   authDomain: "your-project.firebaseapp.com",
   projectId: "your-project-id",
   storageBucket: "your-project.appspot.com",
   messagingSenderId: "123456789",
   appId: "1:123456789:web:abc123",
   measurementId: "G-XXXXXXXX"
};

window.GOOGLE_CLIENT_ID = "1234567890-xxxx.apps.googleusercontent.com";
```

Important:
- `firebase-config.js` contains runtime logic and should not store secrets directly.
- In GitHub Pages deploy, `js/firebase-credentials.js` is overwritten by the `FIREBASE_CONFIG` GitHub secret.

---

## Step 6: Deploy & Test 🚀

### Local Testing:
1. Open `index.html` in a browser (or use your local server)
2. You should see a **"👤 Sign In"** button in the top-right
3. Click it and try to create an account
4. After signing in, go to the **"👤 Profile"** tab

### Deploy to GitHub Pages:
1. Commit all changes:
   ```bash
   git add .
   git commit -m "✨ Add Firebase user authentication & profiles"
   git push
   ```

2. Your site will automatically update on GitHub Pages

### Configure GitHub Secret (required for production):
1. GitHub Repo → **Settings** → **Secrets and variables** → **Actions**
2. Create secret named **`FIREBASE_CONFIG`**
3. Paste the full JavaScript content for `js/firebase-credentials.js` (including both `window.FIREBASE_CREDS` and `window.GOOGLE_CLIENT_ID`)
4. Re-run deployment workflow

---

## Features Overview 🎮

### For Users:

1. **Sign In / Sign Up**
   - Click the **👤 Sign In** button (top-right)
   - Create account with email or Google

2. **Track Collection**
   - Browse cards in the **🧰 Cards** tab
   - Cards you own get a ✓ checkmark (future feature)

3. **Save Decks**
   - Build a deck in **📊 Deck Analysis**
   - Click "Save Deck" to store it in the cloud
   - Access saved decks in **👤 Profile → My Decks**

4. **Wishlist**
   - Add cards you want to your wishlist
   - Track prices and availability

5. **Sync Across Devices**
   - All data is stored in Firebase
   - Sign in on any device to access your data

---

## Database Structure 📚

Firestore collections:

```
users/
  {userId}/
    - collection: [array of card IDs]
    - wishlist: [array of card IDs]
    - settings: {currency, language}
    - createdAt: timestamp
    
    decks/
      {deckId}/
        - name: string
        - cards: [array of card objects]
        - archetype: string
        - createdAt: timestamp
        - updatedAt: timestamp
```

---

## Security & Privacy 🔒

- ✅ Each user can only access their own data
- ✅ Passwords are hashed by Firebase (never stored in plain text)
- ✅ API keys are safe to expose (they're restricted by domain)
- ✅ All data is encrypted in transit (HTTPS)

---

## Troubleshooting 🔧

### "Firebase not defined" error:
- Make sure Firebase SDK scripts are loaded before app scripts
- Check browser console for errors
- Verify Firebase SDK is loaded (Network tab)

### "Google Sign-In does nothing" / blocked:
- Check `js/firebase-credentials.js` for any `PLACEHOLDER_*` values
- Verify `window.GOOGLE_CLIENT_ID` is not placeholder
- In Google Cloud OAuth client, add authorized JavaScript origins:
   - `http://localhost:8000`
   - `http://127.0.0.1:8000`
   - your GitHub Pages URL (e.g. `https://<username>.github.io`)
- In Firebase Console → Authentication → Sign-in method, Google provider must be enabled

### "Insufficient permissions" error:
- Check Firestore security rules (Step 4)
- Make sure user is signed in
- Verify userId matches in rules

### Google Sign-in popup blocked:
- Allow popups for your domain
- Try signing in directlyusers to verify email first:
- In Firebase Console → Authentication → Settings
- Enable "Email enumeration protection" (recommended)

---

## Next Steps 🚀

**Optional Enhancements:**

1. **Email Verification**
   - Require users to verify email before using features
   - In Firebase Console → Authentication → Templates

2. **Password Reset Flow**
   - Already implemented! Click "Forgot password?" link

3. **Profile Pictures**
   - Add Firebase Storage
   - Upload user avatars

4. **Social Features**
   - Share decks with other users
   - Public/private deck visibility

5. **Premium Features**
   - Stripe integration for premium accounts
   - Unlock advanced stats & analytics

---

## Questions? 💬

If you have any issues:
1. Check the browser console (F12) for errors
2. Verify all Firebase services are enabled
3. Check that your config is correct in `firebase-config.js`

**Firebase Documentation:**
- https://firebase.google.com/docs/auth
- https://firebase.google.com/docs/firestore

---

## Cost & Limits 💰

**Firebase Free Tier (Spark Plan):**
- ✅ **Auth:** Unlimited users
- ✅ **Firestore:** 
  - 50k reads/day
  - 20k writes/day
  - 1 GB storage
- ✅ **Hosting:** 10 GB bandwidth/month

**This is MORE than enough for your use case!**

For ~1000 active users:
- Average: 100 reads/user/day = 100k reads/day (~$0)
- Average: 10 writes/user/day = 10k writes/day (~$0)

**You'll stay in the free tier!** 🎉

---

**Setup Complete! Your users can now sign in and save their collections & decks! 🎉**
