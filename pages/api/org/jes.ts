// pages/api/org/jes.ts
//
// Discipline-aware JE fetch
// Officer → discipline + orgUnitPath → fetch only matching JEs
//
// Works for: SDO / EE / SE / CE / ADMIN / PS

import type { NextApiRequest, NextApiResponse } from "next";
import { adminApp, db } from "@/lib/firebaseAdmin";

interface JeSummary {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  orgUnitPath: string;
  discipline?: string;
}

const OFFICER_ROLES = ["SDO", "EE", "SE", "CE", "ADMIN", "PS"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ----------------------------
    // AUTH
    // ----------------------------
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) return res.status(401).json({ error: "Missing token" });

    const decoded = await adminApp.auth().verifyIdToken(token);
    const phoneNumber = decoded.phone_number as string | undefined;

    if (!phoneNumber) {
      return res.status(401).json({ error: "Phone login required." });
    }

    // ----------------------------
    // FIND LOGGED-IN OFFICER
    // ----------------------------
    let snap = await db.collection("users").where("phone", "==", phoneNumber).limit(1).get();

    // fallback for CSV (no +91)
    if (snap.empty && phoneNumber.startsWith("+91")) {
      const local = phoneNumber.replace(/^\+91/, "");
      snap = await db.collection("users").where("phone", "==", local).limit(1).get();
    }

    if (snap.empty) {
      return res.status(403).json({ error: "Officer not found in hierarchy." });
    }

    const userDoc = snap.docs[0];
    const officerCode = userDoc.id;
    const user = { id: officerCode, ...(userDoc.data() as any) };

    // ----------------------------
    // ROLE CHECK
    // ----------------------------
    if (!OFFICER_ROLES.includes(user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // ----------------------------
    // DISCIPLINE + ORG PREFIX
    // ----------------------------
    const prefix = user.orgUnitPath || "";
    const myDiscipline = (user.discipline || "").toUpperCase();

    if (!prefix || !myDiscipline) {
      return res.status(400).json({ error: "User missing orgUnitPath/discipline." });
    }

    // Example prefix = WRD/CIVIL/Z-IND/CIR-01/...
    // JE must have BOTH:
    // - same discipline
    // - orgUnitPath startsWith prefix (relative to level)

    // ----------------------------
    // GET ALL JEs
    // ----------------------------
    const snapJE = await db.collection("users").where("role", "==", "JE").get();
    const jes: JeSummary[] = [];

    snapJE.forEach((doc) => {
      const u = doc.data() as any;

      const uPath = u.orgUnitPath || "";
      const uDiscipline = (u.discipline || "").toUpperCase();

      // 1️⃣ discipline must match
      if (uDiscipline !== myDiscipline) return;

      // 2️⃣ orgUnitPath prefix check
      // Example:
      // officer prefix → WRD/CIVIL/Z-01
      // JE path → WRD/CIVIL/Z-01/CIR-03/...
      if (!uPath.startsWith(prefix)) return;

      jes.push({
        id: doc.id,
        name: u.name || "(no name)",
        phone: u.phone,
        email: u.email,
        orgUnitPath: uPath,
        discipline: uDiscipline,
      });
    });

    return res.status(200).json({ ok: true, jes });
  } catch (err: any) {
    console.error("[/api/org/jes] ERROR:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
