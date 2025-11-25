// pages/api/events.ts
//
// JE/FE progress upload with:
// - Mandatory face+geo verified visit within 24h
// - Upload photo
// - AI audit (stage sequence, discipline detection, realism, etc.)
// - stage.reportedProgressPercent = JE-entered % (0–100, monotonic)
// - JE/FE cannot auto-complete stage beyond what they claim
// - SDO will verify separately

import type { NextApiRequest, NextApiResponse } from "next";
import { adminApp, db } from "@/lib/firebaseAdmin";
import { Storage } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";
import type { UserRole, Stage } from "@/lib/types";
import { analyzeStageProgressWithAI } from "@/lib/aiProgress";

export const config = {
  api: { bodyParser: false },
};

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
    // 1. AUTH → phone_number → officerCode
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
        error: "Phone login required (phone_number missing).",
      });
    }

    // Load JE/FE by phone → officerCode
    let uSnap = await db
      .collection("users")
      .where("phone", "==", phoneNumber)
      .limit(1)
      .get();

    // fallback for CSV without +91
    if (uSnap.empty && phoneNumber.startsWith("+91")) {
      const local = phoneNumber.replace(/^\+91/, "");
      uSnap = await db
        .collection("users")
        .where("phone", "==", local)
        .limit(1)
        .get();
    }

    if (uSnap.empty) {
      return res.status(403).json({
        error: "User not found in hierarchy. Check CSV phone.",
      });
    }

    const userDoc = uSnap.docs[0];
    const officerCode = userDoc.id;
    const user = { id: officerCode, ...(userDoc.data() as any) };

    if (!isFieldRole(user.role)) {
      return res.status(403).json({ error: "Only JE/FE allowed" });
    }

    // ----------------------------
    // 2. PARSE MULTIPART FORMDATA
    // ----------------------------
    const form = await new Promise<any>((resolve, reject) => {
      const busboy = require("busboy")({ headers: req.headers });
      const fields: any = {};
      const files: any = {};

      busboy.on("file", (fieldname: string, file: any, info: any) => {
        const { filename, mimeType } = info;
        const tmp = `/tmp/${uuidv4()}-${filename}`;
        const fs = require("fs");
        const ws = fs.createWriteStream(tmp);
        file.pipe(ws);
        files[fieldname] = { path: tmp, mimeType };
      });

      busboy.on("field", (name: string, value: string) => {
        fields[name] = value;
      });

      busboy.on("finish", () => resolve({ fields, files }));
      req.pipe(busboy);
    });

    const {
      projectId,
      packageId,
      stageId,
      note,
      zone,
      jeComment,
      jePercent,
    } = form.fields || {};

    if (!projectId || !packageId || !stageId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const parsed = Number(jePercent);
    if (jePercent == null || jePercent === "" || Number.isNaN(parsed)) {
      return res
        .status(400)
        .json({ error: "Invalid JE percent (0–100 required)." });
    }
    const boundedPercent = Math.max(0, Math.min(100, parsed));

    // ----------------------------
    // 3. ENSURE RECENT VERIFIED VISIT (createdBy = officerCode)
    // ----------------------------
    const visitSnap = await db
      .collection("projects")
      .doc(projectId)
      .collection("visits")
      .where("createdBy", "==", officerCode)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (visitSnap.empty) {
      return res.status(403).json({
        error: "No site visit found. Do a face+geo visit first.",
      });
    }

    const lastVisit = visitSnap.docs[0].data();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    const createdAtMs =
      typeof lastVisit.createdAt === "number"
        ? lastVisit.createdAt
        : lastVisit.createdAt?.toMillis
        ? lastVisit.createdAt.toMillis()
        : 0;

    if (
      lastVisit.visitType !== "site" ||
      lastVisit.faceVerified !== true ||
      lastVisit.geoVerified !== true ||
      Date.now() - createdAtMs > ONE_DAY
    ) {
      return res.status(403).json({
        error:
          "A face+geo verified site visit (within 24 hours) is required before uploading progress.",
      });
    }

    // ----------------------------
    // 4. UPLOAD PHOTO
    // ----------------------------
    const photo = form.files?.photos;
    if (!photo) {
      return res.status(400).json({ error: "Photo required" });
    }

    const bucketName = process.env.GCS_BUCKET!;
    if (!bucketName) {
      return res
        .status(500)
        .json({ error: "GCS_BUCKET not configured on server" });
    }

    const storage = new Storage();
    const photoName = `progress/${projectId}/${packageId}/${uuidv4()}.jpg`;

    await storage.bucket(bucketName).upload(photo.path, {
      destination: photoName,
      metadata: { contentType: photo.mimeType },
    });

    const photoUrl = `https://storage.googleapis.com/${bucketName}/${photoName}`;

    // ----------------------------
    // 5. LOAD STAGE + PREVIOUS STAGES
    // ----------------------------
    const stageRef = db
      .collection("projects")
      .doc(projectId)
      .collection("packages")
      .doc(packageId)
      .collection("stages")
      .doc(stageId);

    const stageSnap = await stageRef.get();
    if (!stageSnap.exists) {
      return res.status(404).json({ error: "Stage not found" });
    }

    const stage = stageSnap.data() as Stage;

    const currentReported =
      typeof stage.reportedProgressPercent === "number"
        ? stage.reportedProgressPercent
        : 0;

    if (boundedPercent < currentReported) {
      return res.status(400).json({
        error:
          "Progress cannot be reduced by JE. Contact SDO if correction is needed.",
      });
    }

    const prevSnap = await db
      .collection("projects")
      .doc(projectId)
      .collection("packages")
      .doc(packageId)
      .collection("stages")
      .where("order", "<", stage.order)
      .orderBy("order", "desc")
      .limit(3)
      .get();

    const previousStageNames = prevSnap.docs.map((d) => d.data().name);

    // ----------------------------
    // 6. RUN AI AUDIT (NO % CALC)
    // ----------------------------
    let aiResult = null;
    try {
      // 5A. Load project + package for names
      const projSnap = await db.collection("projects").doc(projectId).get();
      let projectName = projectId;
      if (projSnap.exists) {
        const p = projSnap.data() as any;
        projectName = p.name || projectId;
      }

      const pkgSnap = await db
        .collection("projects")
        .doc(projectId)
        .collection("packages")
        .doc(packageId)
        .get();

      let packageName = packageId;
      let packageDiscipline: string | undefined = undefined;
      if (pkgSnap.exists) {
        const pkg = pkgSnap.data() as any;
        packageName = pkg.name || packageId;
        packageDiscipline = pkg.discipline; // "civil" | "electrical" | ...
      }

      // ...then AI call:
      aiResult = await analyzeStageProgressWithAI({
        imageUrls: [photoUrl],
        projectName,
        packageName,
        stageName: stage.name,
        stageOrder: stage.order,
        previousStageNames,
        discipline: packageDiscipline,
      });
    } catch (err) {
      console.error("AI ERROR:", err);
      aiResult = null;
    }

    // ----------------------------
    // 7. WRITE EVENT (createdBy = officerCode)
    // ----------------------------
    const evtRef = db
      .collection("projects")
      .doc(projectId)
      .collection("events")
      .doc();

    const eventData: any = {
      id: evtRef.id,
      eventType: "progress",
      projectId,
      packageId,
      stageId,
      createdBy: officerCode,
      createdAt: Date.now(),
      note: note || "",
      zone: zone || "",
      jeComment: jeComment || "",
      photoUrls: [photoUrl],
      reportedProgressPercent: boundedPercent,
    };

    if (aiResult) {
      eventData.aiDiscipline = aiResult.discipline;
      eventData.aiDetectedStage = aiResult.detectedStageName;
      eventData.sequenceOk = aiResult.sequenceOk;
      eventData.missingStages = aiResult.missingStages;
      eventData.fakePhoto = aiResult.fakePhoto;
      eventData.realism = aiResult.realism;
      eventData.riskScore = aiResult.riskScore;
      eventData.aiSummary = aiResult.comments;
    }

    await evtRef.set(eventData);

    // ----------------------------
    // 8. UPDATE STAGE (JE REPORTED)
    // ----------------------------
    await stageRef.update({
      reportedProgressPercent: boundedPercent,
      lastReportedBy: officerCode,
      lastReportedAt: Date.now(),
    });

    return res.json({
      ok: true,
      eventId: evtRef.id,
      ai: aiResult || null,
    });
  } catch (err: any) {
    console.error("EVENT API ERROR:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal server error" });
  }
}
