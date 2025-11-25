// pages/api/admin/ps-notes.ts
//
// PS meeting remarks per project
// GET  /api/admin/ps-notes?projectId=...
// POST /api/admin/ps-notes  { projectId, text }

import type { NextApiRequest, NextApiResponse } from "next";
import { adminApp, db } from "@/lib/firebaseAdmin";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ error: "Missing token" });
    }

    const decoded = await adminApp.auth().verifyIdToken(token);
    const userId = decoded.uid;

    const userSnap = await db.collection("users").doc(userId).get();
    if (!userSnap.exists) {
      return res.status(403).json({ error: "User not found" });
    }

    const user = userSnap.data() || {};
    const role = user.role || "";
    const displayName = user.name || user.fullName || userId;

    if (req.method === "GET") {
      const projectId = req.query.projectId as string;
      if (!projectId) {
        return res.status(400).json({ error: "projectId required" });
      }

      const notesSnap = await db
        .collection("projects")
        .doc(projectId)
        .collection("psNotes")
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();

      const notes = notesSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));

      return res.json({ ok: true, notes });
    }

    if (req.method === "POST") {
      if (role !== "ADMIN" && role !== "PS") {
        return res.status(403).json({ error: "Not allowed" });
      }

      const { projectId, text } = req.body || {};
      if (!projectId || !text || typeof text !== "string") {
        return res
          .status(400)
          .json({ error: "projectId and text required" });
      }

      const ref = db
        .collection("projects")
        .doc(projectId)
        .collection("psNotes")
        .doc();

      const note = {
        id: ref.id,
        projectId,
        text: text.trim(),
        createdAt: Date.now(),
        createdBy: userId,
        createdByName: displayName,
      };

      await ref.set(note);

      return res.json({ ok: true, note });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("PS-NOTES ERROR", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal error" });
  }
}