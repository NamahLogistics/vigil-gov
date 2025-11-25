// pages/api/je/comment-progress.ts
//
// Updated: Fully officerCode-based (no UID anywhere)
// JE/FE can comment ONLY on their own events

import type { NextApiRequest, NextApiResponse } from "next";
import { adminApp, db } from "@/lib/firebaseAdmin";
import type { UserRole } from "@/lib/types";

function isFieldRole(role: UserRole) {
  return role === "JE" || role === "FE";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ----------------------------
    // 1. AUTH — phone_number → officerCode
    // ----------------------------
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) return res.status(401).json({ error: "Missing token" });

    const decoded = await adminApp.auth().verifyIdToken(token);
    const phoneNumber = decoded.phone_number as string | undefined;

    if (!phoneNumber) {
      return res.status(401).json({
        error: "Phone login required (phone_number missing)",
      });
    }

    // Load JE/FE using phone → officerCode
    let snap = await db
      .collection("users")
      .where("phone", "==", phoneNumber)
      .limit(1)
      .get();

    // fallback for CSV without +91
    if (snap.empty && phoneNumber.startsWith("+91")) {
      const local = phoneNumber.replace(/^\+91/, "");
      snap = await db
        .collection("users")
        .where("phone", "==", local)
        .limit(1)
        .get();
    }

    if (snap.empty)
      return res.status(403).json({
        error: "User not found in hierarchy. Check CSV phone.",
      });

    const userDoc = snap.docs[0];
    const officerCode = userDoc.id;

    const user = {
      id: officerCode,
      officerCode,
      ...(userDoc.data() as any),
    };

    if (!isFieldRole(user.role)) {
      return res.status(403).json({
        error: "Only JE/FE can comment",
      });
    }

    // ----------------------------
    // 2. BODY PARSE
    // ----------------------------
    const { projectId, eventId, jeComment } = req.body || {};

    if (!projectId || !eventId) {
      return res.status(400).json({
        error: "projectId and eventId are required",
      });
    }

    const trimmedComment =
      typeof jeComment === "string" ? jeComment.trim() : "";

    // ----------------------------
    // 3. LOAD EVENT + OWNERSHIP CHECK
    // ----------------------------
    const eventRef = db
      .collection("projects")
      .doc(projectId)
      .collection("events")
      .doc(eventId);

    const eventSnap = await eventRef.get();

    if (!eventSnap.exists) {
      return res.status(404).json({ error: "Event not found" });
    }

    const eventData = eventSnap.data() as any;

    // JE/FE can comment ONLY on their OWN created events
    if (eventData.createdBy !== officerCode) {
      return res.status(403).json({
        error: "You can comment ONLY on events you created",
      });
    }

    // ----------------------------
    // 4. UPDATE COMMENT
    // ----------------------------
    await eventRef.update({
      jeComment: trimmedComment,
      jeCommentUpdatedAt: Date.now(),
    });

    return res.json({
      ok: true,
      eventId,
      projectId,
      jeComment: trimmedComment,
    });
  } catch (err: any) {
    console.error("JE COMMENT ERROR:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal server error" });
  }
}
