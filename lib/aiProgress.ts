// lib/aiProgress.ts
//
// Calls OpenAI to analyse site progress photos for a given stage.
// Returns a structured JSON object we can trust in code.
//
// NOTE: This AI does NOT decide percentage progress.
//       JE/SDO will enter progress manually. AI only audits:
//       - discipline detection
//       - stage detection
//       - sequence correctness
//       - missing stages
//       - fake/suspect photo
//       - realism
//       - risk score
//       - quality issues
//       - short comments

import OpenAI from "openai";

const openaiApiKey = process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
  console.warn(
    "[aiProgress] OPENAI_API_KEY is not set. Any code calling analyzeStageProgressWithAI will fail until you configure it."
  );
}

const client = new OpenAI({
  apiKey: openaiApiKey,
});

export type AIDiscipline = "civil" | "electrical" | "mechanical" | "mixed" | "unknown";

export interface AIProgressResult {
  ok: boolean;

  // What kind of work is visible?
  discipline: AIDiscipline;

  // What stage does this photo *look* like?
  detectedStageName: string | null;

  // 0–1 how sure the model is overall
  confidence: number;

  // Does this stage logically follow the previously completed stages?
  sequenceOk: boolean;

  // If sequence is suspicious, which stages seem to be missing?
  missingStages: string[];

  // Fraud / authenticity signals
  fakePhoto: "yes" | "no" | "suspected";
  realism: "realistic" | "impossible" | "doubtful";

  // 0–100, where higher = more risk / suspicion / quality concerns
  riskScore: number;

  // Plain-language quality issues visible in the photo
  qualityIssues: string[];

  // Short human-readable explanation for engineers / officers
  comments: string;
}

interface AnalyzeParams {
  imageUrls: string[];
  projectName: string;
  packageName: string;
  stageName: string;
  stageOrder?: number;
  previousStageNames: string[]; // last couple of stages that were completed
   discipline?: string;  
}

/**
 * Calls GPT-4.1-mini (vision) to analyse one or more site photos.
 * We force JSON output with a strict schema. This does NOT estimate %
 * progress; JE/SDO will handle that manually in MB.
 */
export async function analyzeStageProgressWithAI(
  params: AnalyzeParams
): Promise<AIProgressResult> {
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const {
    imageUrls,
    projectName,
    packageName,
    stageName,
    stageOrder,
    previousStageNames,
    discipline,
  } = params;

  if (!imageUrls.length) {
    throw new Error("No images provided to AI");
  }

  const systemPrompt = `
You are an experienced civil / electrical / mechanical site inspector working for a government department in India.
You only have access to photos and a short description of the project stage.

Important:
- You do NOT estimate percentage progress. Human engineers will enter physical progress in the Measurement Book (MB).
- Your job is to AUDIT the photo: detect stage, discipline, sequence correctness, quality, and possible fraud.

Your responsibilities:
- Look at the attached site photos.
- Identify what type of work is visible (civil, electrical, mechanical, mixed, or unknown).
- Identify which stage this MOST LIKELY corresponds to (detectedStageName).
- Check if this stage logically follows the previously completed stages (sequenceOk).
- If sequence is suspicious, list missingStages.
- Judge if the photo looks fake or reused (fakePhoto, realism).
- Estimate a riskScore (0–100) summarising all concerns.
- List any visible qualityIssues in plain language.
- Provide a short comments string (2–4 sentences) that a JE/SDO/EE can read quickly.

You MUST respond with a JSON object ONLY (no extra text), with this exact shape:

{
  "ok": boolean,
  "discipline": "civil" | "electrical" | "mechanical" | "mixed" | "unknown",
  "detectedStageName": string | null,
  "confidence": number,
  "sequenceOk": boolean,
  "missingStages": string[],
  "fakePhoto": "yes" | "no" | "suspected",
  "realism": "realistic" | "impossible" | "doubtful",
  "riskScore": number,
  "qualityIssues": string[],
  "comments": string
}

Guidance:

- "discipline":
  - "civil" => roads, buildings, foundations, concrete, masonry, brickwork, plaster, etc.
  - "electrical" => poles, lines, transformers, switchgear, panels, cables, trays, etc.
  - "mechanical" => pumps, rotating machinery, heavy mechanical equipment, etc.
  - "mixed" => clear visible combination of two or more.
  - "unknown" => cannot reliably classify.

- "sequenceOk":
  - true if the visible work is plausible given the provided previousStageNames.
  - false if work appears to have jumped ahead or skipped obvious intermediate stages.

- "fakePhoto":
  - "yes" => clearly not a real site photo or obviously fabricated.
  - "suspected" => repeated / reused / strange lighting / screen-photo / heavy signs of manipulation.
  - "no" => normal real-world photo.

- "riskScore":
  - 0–20 => low risk (everything consistent, no visible issues).
  - 21–50 => medium risk (some quality issues or slightly strange sequence).
  - 51–100 => high risk (fake/suspect photo, big sequence problems, or unsafe quality).

Keep the "comments" concise and factual. Do NOT give suggestions beyond what is visible in the image.
`;

const userText = `
Project: ${projectName}
Package: ${packageName}
Stage (as per MB): ${stageName}
Stage order number (if any): ${stageOrder ?? "unknown"}
Expected discipline (if any): ${discipline ?? "not specified"}

Previously completed stages (most recent first):
${previousStageNames.length ? previousStageNames.join(" -> ") : "None recorded"}

Instruction:
- Visually inspect the attached images.
- Classify the discipline.
- Decide which stage this looks like.
- Check if the stage sequence is logical.
- Identify any missing stages.
- Flag any sign of fake or suspicious photo.
- Highlight visible quality issues.
- Give a short explanation in "comments".
`;


  const content: any[] = [
    {
      type: "text",
      text: userText,
    },
    {
      type: "image_url",
      image_url: {
        url: imageUrls[0],
      },
    },
  ];

  const response = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content },
    ],
  });

  const raw = response.choices[0]?.message?.content || "{}";

  let parsed: AIProgressResult;
  try {
    parsed = JSON.parse(raw) as AIProgressResult;
  } catch (err) {
    console.error("[aiProgress] Failed to parse JSON from model:", raw);
    console.error("[aiProgress] Raw content:", raw);
    throw new Error("AI response not valid JSON");
  }

  // ---------- Sanity defaults & clamping ----------

  if (typeof parsed.ok !== "boolean") parsed.ok = true;

  const validDisciplines: AIDiscipline[] = [
    "civil",
    "electrical",
    "mechanical",
    "mixed",
    "unknown",
  ];
  if (!validDisciplines.includes(parsed.discipline)) {
    parsed.discipline = "unknown";
  }

  if (typeof parsed.detectedStageName !== "string") {
    parsed.detectedStageName = parsed.detectedStageName ?? null;
  }

  if (typeof parsed.confidence !== "number" || Number.isNaN(parsed.confidence)) {
    parsed.confidence = 0.6;
  }
  if (parsed.confidence < 0) parsed.confidence = 0;
  if (parsed.confidence > 1) parsed.confidence = 1;

  if (typeof parsed.sequenceOk !== "boolean") {
    parsed.sequenceOk = true;
  }

  if (!Array.isArray(parsed.missingStages)) {
    parsed.missingStages = [];
  }

  const validFake: Array<"yes" | "no" | "suspected"> = ["yes", "no", "suspected"];
  if (!validFake.includes(parsed.fakePhoto)) {
    parsed.fakePhoto = "no";
  }

  const validRealism: Array<"realistic" | "impossible" | "doubtful"> = [
    "realistic",
    "impossible",
    "doubtful",
  ];
  if (!validRealism.includes(parsed.realism)) {
    parsed.realism = "realistic";
  }

  if (typeof parsed.riskScore !== "number" || Number.isNaN(parsed.riskScore)) {
    parsed.riskScore = 20;
  }
  if (parsed.riskScore < 0) parsed.riskScore = 0;
  if (parsed.riskScore > 100) parsed.riskScore = 100;

  if (!Array.isArray(parsed.qualityIssues)) {
    parsed.qualityIssues = [];
  }

  if (typeof parsed.comments !== "string") {
    parsed.comments = "";
  }

  return parsed;
}
