// lib/firebaseAdmin.ts

import * as admin from "firebase-admin";

let app: admin.app.App;

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase admin env vars");
  }

  // Vercel env me private key "\n" ke saath aati hai, usko real newline banao
  privateKey = privateKey.replace(/\\n/g, "\n");

  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    storageBucket,
  });
} else {
  app = admin.app();
}

export const adminApp = app;
export const db = admin.firestore();
export const bucket = admin.storage().bucket();
