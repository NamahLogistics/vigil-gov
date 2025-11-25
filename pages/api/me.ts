// pages/api/me.ts
//
// Returns the currently logged-in officer
// Auth → (phone_number OR email) → users collection → officerCode doc

import type { NextApiRequest, NextApiResponse } from "next";
import { adminApp, db } from "@/lib/firebaseAdmin";
export const config = { api: { bodyParser: false } };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // ----------------------------------
    // 1. AUTH HEADER
    // ----------------------------------
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ error: "Missing auth token" });
    }

    // ----------------------------------
    // 2. VERIFY TOKEN
    // ----------------------------------
    let phoneNumber: string | undefined;
    let email: string | undefined;

    try {
      const decoded = await adminApp.auth().verifyIdToken(token);
      phoneNumber = decoded.phone_number as string | undefined;
      email = decoded.email as string | undefined;
    } catch (err) {
      console.error("verifyIdToken error:", err);
      return res.status(401).json({ error: "Invalid auth token" });
    }

    // ----------------------------------
    // 3. LOOKUP USER: PHONE FIRST, THEN EMAIL
    // ----------------------------------
    let snap;

    if (phoneNumber) {
      // Primary: match by phone (for field officers)
      snap = await db
        .collection("users")
        .where("phone", "==", phoneNumber)
        .limit(1)
        .get();

      // Fallback when CSV stores numbers without +91
      if (snap.empty && phoneNumber.startsWith("+91")) {
        const local = phoneNumber.replace(/^\+91/, "");
        snap = await db
          .collection("users")
          .where("phone", "==", local)
          .limit(1)
          .get();
      }
    } else if (email) {
      // Secondary: match by email (for Admin / HQ users)
      snap = await db
        .collection("users")
        .where("email", "==", email)
        .limit(1)
        .get();
    } else {
      return res.status(401).json({
        error:
          "No phone number or email found on auth token. Please login again.",
      });
    }

    if (!snap || snap.empty) {
      return res.status(404).json({
        error:
          "User not found in hierarchy. Please check officer master data.",
      });
    }

    // ----------------------------------
    // 4. RETURN OFFICER (ID = officerCode)
    // ----------------------------------
    const doc = snap.docs[0];
    const officerCode = doc.id;
    const data = doc.data() as any;

    return res.status(200).json({
      ok: true,
      user: {
        id: officerCode,
        ...data,
      },
    });
  } catch (err: any) {
    console.error("Error in /api/me:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
