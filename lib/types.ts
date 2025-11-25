// lib/types.ts

export type UserRole =
  | "JE"
  | "FE"
  | "SDO"
  | "EE"
  | "SE"
  | "CE"
  | "ADMIN";

export interface OrgLocation {
  departmentId: string;   // e.g. "POWER", "PWD"
  orgUnitPath: string;    // e.g. "POWER/Zone1/Circle2/Division5/SubDiv3"
}

export interface User {
  id: string;                   // Firestore doc id = auth uid
  name: string;
  email?: string;
  phone?: string;

  role: UserRole;

  departmentId: string;
  orgUnitPath: string;          // main posting path

  orgLocation?: OrgLocation;    // optional structured

  masterFaceUrl?: string;       // reference face for visits

  active: boolean;
  createdAt: number;
}

export interface Project {
  id: string;

  name: string;
  departmentId: string;

  orgUnitPath: string;
  orgLocation?: OrgLocation;

  sanctionedAmount: number;

  siteCenter?: { lat: number; lng: number };
  siteRadiusMeters?: number;

  assignedJeIds: string[];

  physicalPercent: number;
  financialPercent: number;

  riskLevel: "low" | "medium" | "high";

  createdBy: string;
  createdAt: number;
}

export type Discipline = "civil" | "electrical" | "mechanical" | "mixed";

export interface Package {
  id: string;
  projectId: string;

  name: string;
  amount: number;
  discipline: Discipline;

  ownerJeId: string;

  physicalPercent: number;
  financialPercent: number;

  createdAt: number;
}

export type VerificationSource = "site" | "office" | "unknown";

export interface Stage {
  id: string;
  projectId: string;
  packageId: string;

  name: string;
  order: number;
  weightPercent: number;

  reportedProgressPercent?: number;
  verifiedProgressPercent?: number;

  verificationSource?: VerificationSource;

  lastReportedBy?: string;
  lastReportedAt?: number;

  lastVerifiedBy?: string;
  lastVerifiedAt?: number;
}

export type EventType = "progress" | "visit";

export interface GpsPoint {
  lat: number;
  lng: number;
  accuracy?: number;
}

export type VisitType = "site" | "office";

export interface Event {
  id: string;

  projectId: string;
  packageId?: string;
  stageId?: string;

  eventType: EventType;

  createdBy: string;
  createdAt: number;
  takenAt?: number;

  note?: string;
  zone?: string;

  photoUrls: string[];

  faceCheckUrl?: string;

  gps?: GpsPoint;
  geoVerified?: boolean;

  visitType?: VisitType;
  faceVerified?: boolean;

  aiDiscipline?: Discipline | "unknown";
  aiDetectedStage?: string;
  sequenceOk?: boolean;
  missingStages?: string[];
  fakePhoto?: "yes" | "no" | "suspected";
  realism?: "realistic" | "impossible" | "doubtful";
  riskScore?: number;
  aiSummary?: string;

  reportedProgressPercent?: number;
  verifiedProgressPercent?: number;
}

export interface Payment {
  id: string;
  projectId: string;
  packageId?: string;

  billNo: string;
  billDate: number;

  amount: number;

  createdBy: string;
  createdAt: number;
}
