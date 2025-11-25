// pages/api/user/upload-face.ts
import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import { Storage } from "@google-cloud/storage";
import { db } from "@/lib/firebaseAdmin";
import { getAuth } from "firebase-admin/auth";

export const config = {
  api: { bodyParser: false },
};

async function parseForm(req: NextApiRequest) {
  const form = formidable({ multiples: false });
  return new Promise<{ file: formidable.File }>((resolve, reject) => {
    form.parse(req, (err, _fields, files) => {
      if (err) return reject(err);
      const f = Array.isArray(files.file) ? files.file[0] : files.file;
      if (!f) return reject(new Error("No file uploaded"));
      resolve({ file: f });
    });
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // 1) Verify Firebase ID token (authClient already sends Authorization: Bearer token)
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.replace("Bearer ", "");
    const decoded = await getAuth().verifyIdToken(token);

    const phoneNumber = decoded.phone_number;
    if (!phoneNumber) {
      return res.status(400).json({
        error: "Phone-based login required. No phone_number in token.",
      });
    }

    // 2) Find officer doc by phone
    const usersCol = db.collection("users");

    // Try exact match on phone field
    let snap = await usersCol.where("phone", "==", phoneNumber).limit(1).get();

    // If not found, try stripping +91 (assuming India)
    if (snap.empty && phoneNumber.startsWith("+91")) {
      const local = phoneNumber.replace(/^\+91/, "");
      snap = await usersCol.where("phone", "==", local).limit(1).get();
    }

    if (snap.empty) {
      return res.status(404).json({
        error: `No officer found for phone ${phoneNumber}. Check CSV phone column.`,
      });
    }

    const doc = snap.docs[0];
    const officerCode = doc.id; // 👈 docId = officerCode

    // 3) Parse the uploaded image
    const { file } = await parseForm(req);
    // @ts-ignore
    const filepath: string = file.filepath || file.path;
    const buffer = await fs.promises.readFile(filepath);

    // 4) Upload to Cloud Storage
    const storage = new Storage();
    const bucketName =
      process.env.GCS_BUCKET ||
      `${process.env.GOOGLE_CLOUD_PROJECT}.appspot.com`;
    const bucket = storage.bucket(bucketName);

    const objectPath = `faces/${officerCode}.jpg`;
    const gcsFile = bucket.file(objectPath);

    await gcsFile.save(buffer, {
      contentType: file.mimetype || "image/jpeg",
      public: true,
    });

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${objectPath}`;

    // 5) Update Firestore user doc with masterFaceUrl (and mirror to photoUrl for UI)
    await usersCol.doc(officerCode).set(
      {
        masterFaceUrl: publicUrl, // 👈 visits + dashboards use this
        photoUrl: publicUrl,      // 👈 optional: keep for compatibility
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return res.status(200).json({
      success: true,
      officerCode,
      masterFaceUrl: publicUrl,
      photoUrl: publicUrl,
    });
  } catch (err: any) {
    console.error(err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to upload face photo" });
  }
}
