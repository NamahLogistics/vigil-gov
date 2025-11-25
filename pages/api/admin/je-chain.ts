// pages/api/admin/je-chain.ts
//
// Given a JE officerCode, compute chain: SDO, EE, SE, CE above it
// using departmentCode + discipline + orgUnitPath prefix.

import type { NextApiRequest, NextApiResponse } from "next";
import { adminApp, db } from "@/lib/firebaseAdmin";

function cleanStr(v: any): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

interface ChainOfficer {
  officerCode: string;
  name: string;
  role: string;
  orgUnitPath: string;
}

const CHAIN_ROLES = ["SDO", "EE", "SE", "CE"];

function pickClosest(
  jePath: string,
  candidates: FirebaseFirestore.QuerySnapshot
): ChainOfficer | null {
  const je = jePath.split("/");

  let best: ChainOfficer | null = null;
  let bestSegments = -1;

  candidates.forEach((doc) => {
    const u = doc.data() as any;
    const path = (u.orgUnitPath || "") as string;
    if (!path) return;
    const seg = path.split("/");
    // candidate must be prefix of JE path
    if (seg.length > je.length) return;
    for (let i = 0; i < seg.length; i++) {
      if (seg[i] !== je[i]) return;
    }
    if (seg.length > bestSegments) {
      bestSegments = seg.length;
      best = {
        officerCode: doc.id,
        name: u.name || "",
        role: u.role || "",
        orgUnitPath: path,
      };
    }
  });

  return best;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ---------- AUTH – ADMIN only (UID-based, no phone dependency) ----------
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    if (!token) return res.status(401).json({ error: "Missing token" });

    const decoded = await adminApp.auth().verifyIdToken(token);
    const adminUid = decoded.uid;

    const adminSnap = await db.collection("users").doc(adminUid).get();
    if (!adminSnap.exists) {
      return res.status(403).json({ error: "Officer not found." });
    }

    const adminUser = adminSnap.data() as any;
    if (adminUser.role !== "ADMIN") {
      return res.status(403).json({ error: "Only ADMIN allowed." });
    }

    // ---------- Input: officerCode / jeCode ----------
    let officerCode = "";

    if (req.method === "GET") {
      officerCode = cleanStr(
        (req.query.jeCode as string) || (req.query.officerCode as string)
      );
    } else {
      const body = req.body || {};
      officerCode = cleanStr(body.jeCode || body.officerCode);
    }

    if (!officerCode) {
      return res
        .status(400)
        .json({ error: "jeCode (officerCode) required" });
    }

    // Load JE
    const jeRef = db.collection("users").doc(officerCode);
    const jeSnap = await jeRef.get();
    if (!jeSnap.exists) {
      return res.status(404).json({ error: "JE not found" });
    }
    const je = jeSnap.data() as any;
    if (je.role !== "JE" && je.role !== "FE") {
      return res.status(400).json({ error: "Not a JE/FE officer" });
    }

    const dept = je.departmentCode || "";
    const disc = (je.discipline || "").toUpperCase();
    const jePath = je.orgUnitPath || "";

    const chain: Record<string, ChainOfficer | null> = {
      SDO: null,
      EE: null,
      SE: null,
      CE: null,
    };

    for (const role of CHAIN_ROLES) {
      let q: FirebaseFirestore.Query = db
        .collection("users")
        .where("role", "==", role)
        .where("departmentCode", "==", dept);

      if (disc) {
        q = q.where("discipline", "==", disc);
      }

      const snap = await q.get();
      chain[role] = pickClosest(jePath, snap);
    }

    return res.status(200).json({
      ok: true,
      je: {
        officerCode,
        name: je.name || "",
        orgUnitPath: jePath,
      },
      chain,
    });
  } catch (err: any) {
    console.error("[ADMIN je-chain] ERROR:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to compute chain" });
  }
}
