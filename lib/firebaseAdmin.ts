// lib/firebaseAdmin.ts

import * as admin from "firebase-admin";

let app: admin.app.App;

if (!admin.apps.length) {
  app = admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
} else {
  app = admin.app();
}

export const adminApp = app;
export const db = admin.firestore();
export const bucket = admin.storage().bucket();
