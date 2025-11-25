// pages/admin/projects/index.tsx

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/authClient";
import { useUser } from "@/lib/useUser";

type RiskLevel = "low" | "medium" | "high";

interface ProjectOption {
  id: string;
  name: string;
}

interface JeOfficer {
  officerCode: string;
  name: string;
  role: string;
  orgUnitPath: string;
  discipline?: string;
}

interface ChainOfficer {
  officerCode: string;
  name: string;
  role: string;
  orgUnitPath: string;
}

function AdminProjectAndPackagePanel() {
  const { user } = useUser();

  // ---- Project creation fields ----
  const [projName, setProjName] = useState("");
  const [projSanction, setProjSanction] = useState("");
  const [agreementStartDate, setAgreementStartDate] = useState("");
  const [agreementEndDate, setAgreementEndDate] = useState("");
  const [expectedCompletionDate, setExpectedCompletionDate] = useState("");
  const [actualCompletionDate, setActualCompletionDate] = useState("");
  const [siteLat, setSiteLat] = useState("");
  const [siteLng, setSiteLng] = useState("");
  const [siteRadius, setSiteRadius] = useState("");
  const [projectType, setProjectType] = useState<"POINT" | "LINEAR">("POINT");

  // NEW: raw pasted location from Google Maps / WhatsApp
  const [locationText, setLocationText] = useState("");
  const [locationHint, setLocationHint] = useState<string | null>(null);

  const [projectMessage, setProjectMessage] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);

  // ---- Projects list for package creation ----
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // ---- Package creation fields ----
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [pkgName, setPkgName] = useState("");
  const [pkgAmount, setPkgAmount] = useState("");
  const [pkgDiscipline, setPkgDiscipline] = useState("CIVIL");

  const [jeSearchText, setJeSearchText] = useState("");
  const [jeDisciplineFilter, setJeDisciplineFilter] = useState("CIVIL");
  const [jeResults, setJeResults] = useState<JeOfficer[]>([]);
  const [jeLoading, setJeLoading] = useState(false);
  const [jeError, setJeError] = useState<string | null>(null);
  const [selectedJe, setSelectedJe] = useState<JeOfficer | null>(null);

  const [chain, setChain] = useState<ChainOfficer[]>([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);

  const [pkgMessage, setPkgMessage] = useState<string | null>(null);
  const [pkgError, setPkgError] = useState<string | null>(null);
  const [creatingPackage, setCreatingPackage] = useState(false);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    void loadProjects();
  }, [user]);

  async function loadProjects() {
    try {
      setLoadingProjects(true);
      const res = await apiFetch("/api/admin/projects");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load projects");

      const opts: ProjectOption[] = (data.projects || []).map((p: any) => ({
        id: p.id,
        name: p.name,
      }));

      setProjectOptions(opts);
    } catch (err: any) {
      console.error(err);
      // silently ignore for now, package card has its own error
    } finally {
      setLoadingProjects(false);
    }
  }

 function handleFillLatLngFromText() {
  setLocationHint(null);

  const raw = locationText.trim();
  if (!raw) {
    setLocationHint("Paste location text first.");
    return;
  }

  // 0) Try Google Maps URL: ...@26.8552531,80.9948708,17z...
  const atPair = raw.match(/@(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/);
  if (atPair) {
    const latNum = Number(atPair[1]);
    const lngNum = Number(atPair[2]);
    if (
      !Number.isNaN(latNum) &&
      !Number.isNaN(lngNum) &&
      latNum >= -90 &&
      latNum <= 90 &&
      lngNum >= -180 &&
      lngNum <= 180
    ) {
      setSiteLat(latNum.toFixed(6));
      setSiteLng(lngNum.toFixed(6));
      setLocationHint("Latitude & longitude filled from Google Maps link.");
      return;
    }
  }

  // 1) Try plain decimal pair: "26.855253, 80.997446"
  const decimalPair = raw.match(/(-?\d{1,3}\.\d+)[^\d-]+(-?\d{1,3}\.\d+)/);
  if (decimalPair) {
    const latNum = Number(decimalPair[1]);
    const lngNum = Number(decimalPair[2]);
    if (
      !Number.isNaN(latNum) &&
      !Number.isNaN(lngNum) &&
      latNum >= -90 &&
      latNum <= 90 &&
      lngNum >= -180 &&
      lngNum <= 180
    ) {
      setSiteLat(latNum.toFixed(6));
      setSiteLng(lngNum.toFixed(6));
      setLocationHint("Latitude & longitude filled from decimal coordinates.");
      return;
    }
  }

  // 2) Try DMS format: 26°51'18.9"N 80°59'50.8"E
  const latDms = raw.match(
    /(\d{1,3})[°\s]+(\d{1,2})['\s]+(\d{1,2}(?:\.\d+)?)["]?\s*([NS])/i
  );
  const lngDms = raw.match(
    /(\d{1,3})[°\s]+(\d{1,2})['\s]+(\d{1,2}(?:\.\d+)?)["]?\s*([EW])/i
  );

  function dmsToDecimal(
    degStr: string,
    minStr: string,
    secStr: string,
    dir: string
  ) {
    const deg = Number(degStr);
    const min = Number(minStr);
    const sec = Number(secStr);
    let dec = deg + min / 60 + sec / 3600;
    if (dir === "S" || dir === "W") dec = -dec;
    return dec;
  }

  if (latDms && lngDms) {
    const latNum = dmsToDecimal(latDms[1], latDms[2], latDms[3], latDms[4].toUpperCase());
    const lngNum = dmsToDecimal(lngDms[1], lngDms[2], lngDms[3], lngDms[4].toUpperCase());

    if (
      !Number.isNaN(latNum) &&
      !Number.isNaN(lngNum) &&
      latNum >= -90 &&
      latNum <= 90 &&
      lngNum >= -180 &&
      lngNum <= 180
    ) {
      setSiteLat(latNum.toFixed(6));
      setSiteLng(lngNum.toFixed(6));
      setLocationHint("Latitude & longitude filled from DMS coordinates.");
      return;
    }
  }

  // 3) Last fallback – first 2 numeric tokens
  const matches = raw.match(/-?\d+(\.\d+)?/g);
  if (!matches || matches.length < 2) {
    setLocationHint("Could not detect latitude/longitude in this text.");
    return;
  }

  const latNum = Number(matches[0]);
  const lngNum = Number(matches[1]);

  if (
    Number.isNaN(latNum) ||
    Number.isNaN(lngNum) ||
    latNum < -90 ||
    latNum > 90 ||
    lngNum < -180 ||
    lngNum > 180
  ) {
    setLocationHint("Numbers found, but they don't look like valid coordinates.");
    return;
  }

  setSiteLat(latNum.toFixed(6));
  setSiteLng(lngNum.toFixed(6));
  setLocationHint("Latitude & longitude filled from numeric text.");
}


  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    try {
      setCreatingProject(true);
      setProjectError(null);
      setProjectMessage(null);

      const body = {
        name: projName.trim(),
        sanctionedAmount: projSanction ? Number(projSanction) : null,
        agreementStartDate: agreementStartDate || null,
        agreementEndDate: agreementEndDate || null,
        expectedCompletionDate: expectedCompletionDate || null,
        actualCompletionDate: actualCompletionDate || null,
        siteLat: siteLat ? Number(siteLat) : null,
        siteLng: siteLng ? Number(siteLng) : null,
        siteRadiusMeters: siteRadius ? Number(siteRadius) : null,
        projectType, // 👈 POINT vs LINEAR
      };

      const res = await apiFetch("/api/admin/create-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create project");

      setProjectMessage("Project created successfully.");

      // add to dropdown list
      if (data.project && data.project.id && data.project.name) {
        setProjectOptions((prev) => [
          ...prev,
          { id: data.project.id, name: data.project.name },
        ]);
      } else if (data.id && body.name) {
        setProjectOptions((prev) => [
          ...prev,
          { id: data.id as string, name: body.name as string },
        ]);
      }

      // reset form
      setProjName("");
      setProjSanction("");
      setAgreementStartDate("");
      setAgreementEndDate("");
      setExpectedCompletionDate("");
      setActualCompletionDate("");
      setSiteLat("");
      setSiteLng("");
      setSiteRadius("");
      setLocationText("");
      setLocationHint(null);
      setProjectType("POINT");
    } catch (err: any) {
      console.error(err);
      setProjectError(err.message || "Error creating project");
    } finally {
      setCreatingProject(false);
    }
  }

async function handleJeSearch(e?: React.FormEvent) {
  if (e) e.preventDefault();
  try {
    setJeLoading(true);
    setJeError(null);
    setJeResults([]);
    setSelectedJe(null);
    setChain([]);
    setChainError(null);

    const params = new URLSearchParams();
    if (jeDisciplineFilter) params.set("discipline", jeDisciplineFilter);
    if (jeSearchText.trim()) params.set("q", jeSearchText.trim());

    const res = await apiFetch(
      `/api/admin/je-search?${params.toString()}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to search JE");

    setJeResults(data.jes || data.officers || []);

  } catch (err: any) {
    console.error(err);
    setJeError(err.message || "Error searching JE");
  } finally {
    setJeLoading(false);
  }
}


async function handleLoadChain(officerCode: string) {
  try {
    setChainLoading(true);
    setChainError(null);
    setChain([]);

    const res = await apiFetch(
      `/api/admin/je-chain?officerCode=${officerCode}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load chain");

    // 🔹 data.je + data.chain (object) ko nice ordered array me convert karo
    const chainArray: ChainOfficer[] = [];

    if (data.je) {
      chainArray.push({
        officerCode: data.je.officerCode,
        name: data.je.name,
        role: "JE",
        orgUnitPath: data.je.orgUnitPath || "",
      });
    }

    if (data.chain) {
      const order: Array<"SDO" | "EE" | "SE" | "CE"> = [
        "SDO",
        "EE",
        "SE",
        "CE",
      ];
      for (const role of order) {
        const off = data.chain[role];
        if (off && off.officerCode) {
          chainArray.push(off as ChainOfficer);
        }
      }
    }

    setChain(chainArray);
  } catch (err: any) {
    console.error(err);
    setChainError(err.message || "Error loading chain");
  } finally {
    setChainLoading(false);
  }
}


  async function handleCreatePackage(e: React.FormEvent) {
    e.preventDefault();
    try {
      setCreatingPackage(true);
      setPkgError(null);
      setPkgMessage(null);

      if (!selectedProjectId) {
        throw new Error("Please select a project.");
      }
      if (!pkgName.trim()) {
        throw new Error("Please enter package name.");
      }
      if (!selectedJe) {
        throw new Error("Please select JE for the package.");
      }

      const body = {
        projectId: selectedProjectId,
        name: pkgName.trim(),
        amount: pkgAmount ? Number(pkgAmount) : null,
        discipline: pkgDiscipline,
        ownerJeCode: selectedJe.officerCode,
      };

      const res = await apiFetch("/api/admin/create-package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create package");

      setPkgMessage("Package created and chain linked successfully.");

      // reset package fields
      setSelectedProjectId("");
      setPkgName("");
      setPkgAmount("");
      setPkgDiscipline("CIVIL");
      setJeSearchText("");
      setJeResults([]);
      setSelectedJe(null);
      setChain([]);
    } catch (err: any) {
      console.error(err);
      setPkgError(err.message || "Error creating package");
    } finally {
      setCreatingPackage(false);
    }
  }

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="text-xs text-red-600">
        Not authorized. ADMIN access only.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* TOP BAR / NAV */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-baseline gap-2">
          <h1 className="text-base font-semibold">Projects & Packages</h1>
          <span className="text-[11px] text-gray-500">
            Create projects, define type (Point / Linear), and link JE chain to
            packages.
          </span>
        </div>
        <Link
          href="/admin"
          className="px-3 py-1 border rounded text-[11px] bg-white shadow-sm"
        >
          ← Back to Admin Home
        </Link>
      </div>

      {/* PROJECT CREATE */}
      <section className="bg-white border rounded p-3 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Create Project</h2>
          {projectMessage && (
            <div className="text-[11px] text-green-600">
              {projectMessage}
            </div>
          )}
          {projectError && (
            <div className="text-[11px] text-red-600">{projectError}</div>
          )}
        </div>

        <form
          onSubmit={handleCreateProject}
          className="grid grid-cols-1 md:grid-cols-3 gap-3"
        >
          <div className="space-y-1">
            <label className="block text-[11px]">Project Name</label>
            <input
              className="border rounded px-2 py-1 w-full text-xs"
              value={projName}
              onChange={(e) => setProjName(e.target.value)}
              placeholder="e.g. Construction of XYZ Building"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px]">Sanctioned Amount (₹)</label>
            <input
              type="number"
              className="border rounded px-2 py-1 w-full text-xs"
              value={projSanction}
              onChange={(e) => setProjSanction(e.target.value)}
              placeholder="e.g. 50000000"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px]">Project Type</label>
            <select
              className="border rounded px-2 py-1 w-full text-xs"
              value={projectType}
              onChange={(e) =>
                setProjectType(e.target.value as "POINT" | "LINEAR")
              }
            >
              <option value="POINT">Point (single site)</option>
              <option value="LINEAR">
                Linear (road / canal / pipeline / transmission line)
              </option>
            </select>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Linear projects will support multiple route points for field
              geo-verification.
            </p>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px]">Agreement Start Date</label>
            <input
              type="date"
              className="border rounded px-2 py-1 w-full text-xs"
              value={agreementStartDate}
              onChange={(e) => setAgreementStartDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px]">Agreement End Date</label>
            <input
              type="date"
              className="border rounded px-2 py-1 w-full text-xs"
              value={agreementEndDate}
              onChange={(e) => setAgreementEndDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px]">
              Expected Completion Date
            </label>
            <input
              type="date"
              className="border rounded px-2 py-1 w-full text-xs"
              value={expectedCompletionDate}
              onChange={(e) => setExpectedCompletionDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px]">
              Actual Completion Date (if completed)
            </label>
            <input
              type="date"
              className="border rounded px-2 py-1 w-full text-xs"
              value={actualCompletionDate}
              onChange={(e) => setActualCompletionDate(e.target.value)}
            />
          </div>

          {/* NEW: Paste location helper (Google Maps / WhatsApp) */}
          <div className="space-y-1 md:col-span-3">
            <label className="block text-[11px]">
              Location text (Google Maps / WhatsApp)
            </label>
            <div className="flex gap-2">
              <input
                className="border rounded px-2 py-1 w-full text-xs"
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder="Paste something like: 26.8467, 80.9462 or a Google Maps link"
              />
              <button
                type="button"
                onClick={handleFillLatLngFromText}
                className="bg-gray-800 text-white px-3 py-1 rounded text-[11px]"
              >
                Fill Lat/Lng
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Google Maps: long-press on site → copy coordinates like
              &quot;26.8467, 80.9462&quot; and paste here. WhatsApp: copy the
              location text and paste here. We&apos;ll auto-detect latitude and
              longitude.
            </p>
            {locationHint && (
              <p className="text-[10px] mt-0.5 text-gray-600">
                {locationHint}
              </p>
            )}
          </div>

          {/* Location inputs mainly for POINT projects but allowed for all */}
          <div className="space-y-1">
            <label className="block text-[11px]">
              Site Latitude (centre point)
            </label>
            <input
              type="number"
              step="0.000001"
              className="border rounded px-2 py-1 w-full text-xs"
              value={siteLat}
              onChange={(e) => setSiteLat(e.target.value)}
              placeholder="e.g. 26.8467"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px]">
              Site Longitude (centre point)
            </label>
            <input
              type="number"
              step="0.000001"
              className="border rounded px-2 py-1 w-full text-xs"
              value={siteLng}
              onChange={(e) => setSiteLng(e.target.value)}
              placeholder="e.g. 80.9462"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px]">
              Geo Radius (meters) for visit validation
            </label>
            <input
              type="number"
              className="border rounded px-2 py-1 w-full text-xs"
              value={siteRadius}
              onChange={(e) => setSiteRadius(e.target.value)}
              placeholder="e.g. 200"
            />
            <p className="text-[10px] text-gray-500 mt-0.5">
              For POINT projects this is the distance from centre; for LINEAR
              projects, additional route points will be configured on the
              project detail page.
            </p>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={creatingProject}
              className="bg-blue-600 text-white px-3 py-1 rounded text-xs disabled:opacity-60"
            >
              {creatingProject ? "Creating…" : "Create Project"}
            </button>
          </div>
        </form>
      </section>

      {/* PACKAGE CREATE */}
      <section className="bg-white border rounded p-3 text-xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Create Package & Assign Chain</h2>
          {pkgMessage && (
            <div className="text-[11px] text-green-600">{pkgMessage}</div>
          )}
          {pkgError && (
            <div className="text-[11px] text-red-600">{pkgError}</div>
          )}
        </div>

        {/* Project selection + basic package fields */}
        <form onSubmit={handleCreatePackage} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px]">Project</label>
              <select
                className="border rounded px-2 py-1 w-full text-xs"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                <option value="">Select project</option>
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {loadingProjects && (
                <p className="text-[10px] text-gray-500 mt-1">
                  Loading projects…
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-[11px]">Package Name</label>
              <input
                className="border rounded px-2 py-1 w-full text-xs"
                value={pkgName}
                onChange={(e) => setPkgName(e.target.value)}
                placeholder="e.g. Package-1 (Main Building)"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px]">Package Amount (₹)</label>
              <input
                type="number"
                className="border rounded px-2 py-1 w-full text-xs"
                value={pkgAmount}
                onChange={(e) => setPkgAmount(e.target.value)}
                placeholder="e.g. 25000000"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px]">Discipline</label>
              <select
                className="border rounded px-2 py-1 w-full text-xs"
                value={pkgDiscipline}
                onChange={(e) => setPkgDiscipline(e.target.value)}
              >
                <option value="CIVIL">CIVIL</option>
                <option value="ELECTRICAL">ELECTRICAL</option>
                <option value="MECHANICAL">MECHANICAL</option>
              </select>
            </div>
          </div>

          {/* JE search + selection */}
          <div className="border rounded p-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[11px]">
                Select JE for this package
              </span>
              {jeError && (
                <span className="text-[11px] text-red-600">{jeError}</span>
              )}
            </div>

           {/* JE search controls */}
<div className="flex flex-wrap gap-2 items-end">
  <div>
    <label className="block text-[11px] mb-1">Discipline</label>
    <select
      className="border rounded px-2 py-1 text-xs"
      value={jeDisciplineFilter}
      onChange={(e) => setJeDisciplineFilter(e.target.value)}
    >
      <option value="CIVIL">CIVIL</option>
      <option value="ELECTRICAL">ELECTRICAL</option>
      <option value="MECHANICAL">MECHANICAL</option>
    </select>
  </div>
  <div>
    <label className="block text-[11px] mb-1">
      Search JE (name / phone / code)
    </label>
    <input
      className="border rounded px-2 py-1 text-xs"
      value={jeSearchText}
      onChange={(e) => setJeSearchText(e.target.value)}
      placeholder="Type and search"
    />
  </div>
  <button
    type="button"
    disabled={jeLoading}
    onClick={() => handleJeSearch()}
    className="bg-gray-800 text-white px-3 py-1 rounded text-[11px] disabled:opacity-60"
  >
    {jeLoading ? "Searching…" : "Search JE"}
  </button>
</div>


            {/* JE list */}
            <div className="max-h-40 overflow-y-auto border rounded">
              {jeResults.length === 0 && !jeLoading && (
                <div className="text-[11px] text-gray-500 px-2 py-3">
                  No JE results. Try search or change discipline filter.
                </div>
              )}
              {jeResults.map((je) => {
                const isSelected =
                  selectedJe && selectedJe.officerCode === je.officerCode;
                return (
                  <div
                    key={je.officerCode}
                    className={`flex items-center justify-between px-2 py-1 border-b text-[11px] ${
                      isSelected ? "bg-blue-50" : "bg-white"
                    }`}
                  >
                    <div>
                      <div className="font-medium">
                        {je.name}{" "}
                        <span className="text-[10px] text-gray-500">
                          ({je.officerCode})
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {je.orgUnitPath}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedJe(je);
                        void handleLoadChain(je.officerCode);
                      }}
                      className="text-blue-600 hover:underline text-[11px]"
                    >
                      {isSelected ? "Selected" : "Select & Load Chain"}
                    </button>
                  </div>
                );
              })}
            </div>

       {/* Chain preview */}
<div className="border rounded p-2 mt-2">
  <div className="flex items-center justify-between">
    <span className="font-medium text-[11px]">
      Reporting Chain Preview
    </span>
    {chainError && (
      <span className="text-[11px] text-red-600">{chainError}</span>
    )}
  </div>

  {chainLoading && (
    <div className="text-[11px] text-gray-500 mt-1">Loading chain…</div>
  )}

  {!chainLoading && chain.length === 0 && (
    <div className="text-[11px] text-gray-500 mt-1">
      Select a JE and load chain to preview JE / SDO / EE / SE / CE.
    </div>
  )}

  {!chainLoading && chain.length > 0 && (
    <ol className="mt-2 space-y-1 text-[11px]">
      {chain.map((off) => (
        <li key={off.role}>
          <span className="font-semibold">{off.role}:</span>{" "}
          {off.name}{" "}
          <span className="text-[10px] text-gray-500">
            ({off.officerCode}) – {off.orgUnitPath}
          </span>
        </li>
      ))}
    </ol>
  )}
</div>

          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creatingPackage}
              className="bg-blue-600 text-white px-3 py-1 rounded text-xs disabled:opacity-60"
            >
              {creatingPackage ? "Creating Package…" : "Create Package"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function AdminProjectsPage() {
  return <AdminProjectAndPackagePanel />;
}
