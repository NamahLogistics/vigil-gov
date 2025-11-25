// pages/api/visits.ts
//
// Visit event API (JE / SDO / EE / SE / CE, etc.)
//
// - POST multipart/form-data
//   fields:
//     projectId: string
//     visitType: "site" | "office"
//     lat: string (required for site; optional for office)
//     lng: string
//     accuracy: string
//   files:
//     face: image/*
//
// - Validates Firebase auth
// - Loads officer (from users collection by phone_number)
//   (must have photoUrl enrolled from /setup-face)
// - Uploads live "face" to GCS
// - Uses AWS Rekognition CompareFaces to verify face
//   (unless ALLOW_FAKE_FACE_MATCH=true, then auto-pass for dev)
// - GEO verification:
//
//   POINT projects:
//     - require project.siteCenter + project.siteRadiusMeters
//     - geoVerified = distance(userGPS, siteCenter) <= radius
//
//   LINEAR projects:
//     - expect project.routePoints?: { id, name, lat, lng, km?, active? }[]
//     - corridor radius = project.siteRadiusMeters || 300 (m)
//     - geoVerified = distance(userGPS, nearestActiveRoutePoint) <= corridor
//
// - Writes visit event under:
//     projects/{projectId}/visits/{visitId}

import type { NextApiRequest, NextApiResponse } from "next";
import { adminApp, db } from "@/lib/firebaseAdmin";
import { Storage } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";
import type { VisitType, Project } from "@/lib/types";
import { RekognitionClient, CompareFacesCommand } from "@aws-sdk/client-rekognition";

const storage = new Storage();

// Rekognition client – only used when ALLOW_FAKE_FACE_MATCH !== "true"
const rekognition =
  process.env.ALLOW_FAKE_FACE_MATCH === "true"
    ? null
    : new RekognitionClient({
        region: process.env.AWS_REGION,
      });

export const config = {
  api: { bodyParser: false },
};

// Download an image URL to a Buffer (GCS public URL in our case)
async function downloadImageToBuffer(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download image for face match: ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

// High-security face match using AWS Rekognition CompareFaces
async function performHighSecurityFaceMatch(
  masterUrl: string,
  liveUrl: string
): Promise<boolean> {
  // Dev / staging bypass: always succeed
  if (process.env.ALLOW_FAKE_FACE_MATCH === "true") {
    console.warn("[VISITS] ALLOW_FAKE_FACE_MATCH=true → skipping real face match.");
    return true;
  }

  if (!rekognition) {
    console.error("[VISITS] Rekognition client not initialized.");
    return false;
  }

  const threshold =
    Number(process.env.FACE_MATCH_MIN_SCORE || "90") || 90;

  try {
    const [masterBytes, liveBytes] = await Promise.all([
      downloadImageToBuffer(masterUrl),
      downloadImageToBuffer(liveUrl),
    ]);

    const command = new CompareFacesCommand({
      SourceImage: { Bytes: masterBytes },
      TargetImage: { Bytes: liveBytes },
      SimilarityThreshold: threshold,
    });

    const result = await rekognition.send(command);
    const similarity =
      result.FaceMatches && result.FaceMatches[0]
        ? result.FaceMatches[0].Similarity ?? 0
        : 0;

    console.log(
      `[VISITS] Face similarity = ${similarity?.toFixed?.(2) ?? similarity} (threshold=${threshold})`
    );

    return (similarity || 0) >= threshold;
  } catch (err: any) {
    console.error("[VISITS] Face match error:", err);
    // On error, be conservative and FAIL
    return false;
  }
}

// Haversine distance in meters
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // meters
  const toRad = (d: number) => (d * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ error: "Method not allowed" });

    // ----------------------------
    // 1. Auth
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
        error: "Phone-based login required (no phone_number in token).",
      });
    }

    // ----------------------------
    // 2. Get Officer (users collection by phone)
    // ----------------------------
    let userSnap = await db
      .collection("users")
      .where("phone", "==", phoneNumber)
      .limit(1)
      .get();

    // If CSV stored phone without +91
    if (userSnap.empty && phoneNumber.startsWith("+91")) {
      const local = phoneNumber.replace(/^\+91/, "");
      userSnap = await db
        .collection("users")
        .where("phone", "==", local)
        .limit(1)
        .get();
    }

    if (userSnap.empty) {
      return res.status(404).json({
        error:
          "Officer not found in hierarchy. Please ensure CSV phone matches login phone.",
      });
    }

    const userDoc = userSnap.docs[0];
    const officerCode = userDoc.id;
    const user = { officerCode, ...(userDoc.data() as any) };

    // Restrict which roles can mark visits (optional)
    const allowedRoles = ["JE", "FE", "SDO", "EE", "SE", "CE", "ADMIN", "PS"];
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: "Role not allowed to mark visits" });
    }

    // Officer must have face enrolled via /setup-face
    if (!user.photoUrl) {
      return res.status(400).json({
        error:
          "No face photo registered. Please complete face setup before marking visits.",
      });
    }

    // ----------------------------
    // 3. Parse FormData (busboy)
    // ----------------------------
    const form = await new Promise<any>((resolve, reject) => {
      const busboy = require("busboy")({ headers: req.headers });
      const fields: any = {};
      const files: any = {};

      busboy.on("file", (fieldname: string, file: any, info: any) => {
        const { filename, mimeType } = info;
        const tmp = `/tmp/${uuidv4()}-${filename}`;
        const fs = require("fs");
        const writeStream = fs.createWriteStream(tmp);
        file.pipe(writeStream);
        files[fieldname] = { path: tmp, mimeType };
      });

      busboy.on("field", (fieldname: string, value: string) => {
        fields[fieldname] = value;
      });

      busboy.on("finish", () => resolve({ fields, files }));
      req.pipe(busboy);
    });

    const { fields, files } = form;
    const { projectId, lat, lng, accuracy, visitType } = fields;

    if (!projectId || !visitType) {
      return res
        .status(400)
        .json({ error: "projectId and visitType required" });
    }

    const vt: VisitType = visitType === "office" ? "office" : "site";

    // ----------------------------
    // 4. Load Project
    // ----------------------------
    const projSnap = await db.collection("projects").doc(projectId).get();
    if (!projSnap.exists)
      return res.status(404).json({ error: "Project not found" });

    const project = {
      id: projSnap.id,
      ...(projSnap.data() as any),
    } as Project & {
      projectType?: "POINT" | "LINEAR";
      routePoints?: {
        id: string;
        name: string;
        lat: number;
        lng: number;
        km?: number;
        active?: boolean;
      }[];
      siteCenter?: { lat: number; lng: number };
      siteRadiusMeters?: number;
    };

    // ----------------------------
    // 5. Upload live face photo
    // ----------------------------
    if (!files.face)
      return res.status(400).json({ error: "Face photo required" });

    const faceFile = files.face;
    const bucketName =
      process.env.GCS_BUCKET ||
      `${process.env.GOOGLE_CLOUD_PROJECT}.appspot.com`;

    if (!bucketName) {
      return res
        .status(500)
        .json({ error: "GCS_BUCKET not configured on server" });
    }

    // Store live visit photo under visits/{projectId}/{officerCode}/{uuid}.jpg
    const uniqueFaceName = `visits/${projectId}/${officerCode}/${uuidv4()}.jpg`;

    await storage.bucket(bucketName).upload(faceFile.path, {
      destination: uniqueFaceName,
      metadata: { contentType: faceFile.mimeType },
    });

    const faceUrl = `https://storage.googleapis.com/${bucketName}/${uniqueFaceName}`;

    // ----------------------------
    // 6. FACE RECOGNITION
    // ----------------------------
    const masterFaceUrl: string | undefined = (user as any).masterFaceUrl;

    if (!masterFaceUrl) {
      return res.status(400).json({
        error:
          "Master face not enrolled for this officer. Please complete face setup before marking visits.",
      });
    }

    const faceVerified = await performHighSecurityFaceMatch(
      masterFaceUrl,
      faceUrl
    );

    if (!faceVerified) {
      return res.status(403).json({
        error: "Face verification failed. Visit not recorded.",
      });
    }

    // ----------------------------
    // 7. GEO VERIFICATION (POINT + LINEAR)
    // ----------------------------
    let geoVerified = false;
    let geoMethod: "POINT_RADIUS" | "ROUTE_CORRIDOR" | "NONE" = "NONE";

    let latN: number | null = null;
    let lngN: number | null = null;
    let distanceMeters: number | null = null;
    let routePointId: string | null = null;
    let routePointName: string | null = null;

    if (lat != null && lng != null && lat !== "" && lng !== "") {
      latN = Number(lat);
      lngN = Number(lng);
      if (Number.isNaN(latN) || Number.isNaN(lngN)) {
        latN = null;
        lngN = null;
      }
    }

    const projectType = project.projectType || "POINT";
    const accuracyN =
      accuracy != null && accuracy !== "" ? Number(accuracy) : 0;

    if (
      vt === "site" &&
      latN != null &&
      lngN != null &&
      !Number.isNaN(latN) &&
      !Number.isNaN(lngN)
    ) {
      if (
        projectType === "LINEAR" &&
        Array.isArray(project.routePoints) &&
        project.routePoints.length > 0
      ) {
        // LINEAR: nearest active route point + corridor
        const activePoints = project.routePoints.filter(
          (rp) => rp && (rp.active !== false)
        );
        const points = activePoints.length > 0
          ? activePoints
          : project.routePoints;

        let bestDist = Infinity;
        let bestRp: (typeof points)[number] | null = null;

        for (const rp of points) {
          if (
            typeof rp.lat === "number" &&
            typeof rp.lng === "number" &&
            !Number.isNaN(rp.lat) &&
            !Number.isNaN(rp.lng)
          ) {
            const d = haversineMeters(latN, lngN, rp.lat, rp.lng);
            if (d < bestDist) {
              bestDist = d;
              bestRp = rp;
            }
          }
        }

        if (bestRp) {
          distanceMeters = bestDist;
          routePointId = bestRp.id;
          routePointName = bestRp.name;

          const corridor =
            typeof project.siteRadiusMeters === "number" &&
            !Number.isNaN(project.siteRadiusMeters)
              ? project.siteRadiusMeters
              : 300; // default 300 m corridor

          geoVerified = bestDist <= corridor;
          geoMethod = "ROUTE_CORRIDOR";
        } else if (
          project.siteCenter &&
          typeof project.siteCenter.lat === "number" &&
          typeof project.siteCenter.lng === "number" &&
          typeof project.siteRadiusMeters === "number"
        ) {
          // Fallback to POINT logic if somehow no usable route point
          const d = haversineMeters(
            latN,
            lngN,
            project.siteCenter.lat,
            project.siteCenter.lng
          );
          distanceMeters = d;
          geoVerified = d <= project.siteRadiusMeters!;
          geoMethod = "POINT_RADIUS";
        }
      } else if (
        project.siteCenter &&
        typeof project.siteCenter.lat === "number" &&
        typeof project.siteCenter.lng === "number" &&
        typeof project.siteRadiusMeters === "number"
      ) {
        // POINT projects (or LINEAR without routePoints configured yet)
        const d = haversineMeters(
          latN,
          lngN,
          project.siteCenter.lat,
          project.siteCenter.lng
        );
        distanceMeters = d;
        geoVerified = d <= project.siteRadiusMeters!;
        geoMethod = "POINT_RADIUS";
      }
    }

    // ----------------------------
    // 8. SAVE VISIT EVENT
    // ----------------------------
    const evtRef = db
      .collection("projects")
      .doc(projectId)
      .collection("visits")
      .doc();

    await evtRef.set({
      id: evtRef.id,
      eventType: "visit",
      projectId,
      createdBy: officerCode, // officerCode as creator
      createdAt: Date.now(),
      visitType: vt,
      faceCheckUrl: faceUrl,
      faceVerified,
      gps:
        latN != null && lngN != null
          ? {
              lat: latN,
              lng: lngN,
              accuracy: accuracyN,
            }
          : null,
      geoVerified,
      projectType,
      geoMethod,
      routePointId: routePointId || null,
      routePointName: routePointName || null,
      distanceMeters,
    });

    return res.json({
      ok: true,
      event: {
        faceVerified,
        geoVerified,
        visitType: vt,
        projectType,
        geoMethod,
        routePointId,
        routePointName,
        distanceMeters,
      },
    });
  } catch (err: any) {
    console.error("VISIT ERROR:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal error" });
  }
}
