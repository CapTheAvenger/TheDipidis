// firebase-credentials.js
// ========================
// This file is REPLACED entirely by GitHub Actions (deploy-pages.yml) using the
// FIREBASE_CONFIG secret. The secret must contain exactly this format:
//
//   window.FIREBASE_CREDS = {
//     apiKey: "AIzaSy...",
//     authDomain: "your-project.firebaseapp.com",
//     projectId: "your-project-id",
//     storageBucket: "your-project.appspot.com",
//     messagingSenderId: "123456789",
//     appId: "1:123456789:web:abc123",
//     measurementId: "G-XXXXXXXX"
//   };
//
// For local development, replace the PLACEHOLDER values below with your real
// Firebase project credentials from the Firebase Console.

window.FIREBASE_CREDS = {
  apiKey: "PLACEHOLDER_API_KEY",
  authDomain: "PLACEHOLDER_AUTHDOMAIN",
  projectId: "PLACEHOLDER_PROJECT_ID",
  storageBucket: "PLACEHOLDER_BUCKET",
  messagingSenderId: "PLACEHOLDER_SENDER_ID",
  appId: "PLACEHOLDER_APP_ID",
  measurementId: "PLACEHOLDER_MEASUREMENT_ID"
};
