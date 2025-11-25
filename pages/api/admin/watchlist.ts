// pages/api/admin/watchlist.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { adminApp, db } from "@/lib/firebaseAdmin";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ error: "Missing token" });
    }

    const decoded = await adminApp.auth().verifyIdToken(token);
    const userId = decoded.uid;

    const userRef = db.collection("users").doc(userId);
    const snap = await userRef.get();
    if (!snap.exists) {
      return res.status(403).json({ error: "User not found" });
    }

    const user = snap.data() || {};
    const role = user.role || "";

    // Sirf ADMIN / PS ko watchlist ka control
    if (role !== "ADMIN" && role !== "PS") {
      return res.status(403).json({ error: "Not allowed" });
    }

    const { projectId, action } = req.body || {};
    if (!projectId) {
      return res.status(400).json({ error: "projectId required" });
    }

    let list: string[] = Array.isArray(user.psWatchlist)
      ? [...user.psWatchlist]
      : [];

    const idx = list.indexOf(projectId);

    if (action === "remove") {
      if (idx !== -1) list.splice(idx, 1);
    } else {
      // default ADD
      if (idx === -1) list.push(projectId);
    }

    await userRef.update({ psWatchlist: list });

    return res.json({ ok: true, psWatchlist: list });
  } catch (err: any) {
    console.error("WATCHLIST ERROR", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal error" });
  }
}