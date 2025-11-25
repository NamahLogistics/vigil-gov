// pages/admin/hierarchy/index.tsx

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useUser } from "@/lib/useUser";
import { apiFetch } from "@/lib/authClient";

interface ImportSummary {
  created: number;
  updated: number;
  errors: number;
}

interface Officer {
  id: string;
  officerCode: string;
  name: string;
  phone: string;
  email: string;
  role: string;
  departmentCode: string;
  departmentName: string;
  discipline?: string;
  zoneCode: string;
  zoneName: string;
  circleCode: string;
  circleName: string;
  divisionCode: string;
  divisionName: string;
  subdivisionCode: string;
  subdivisionName: string;
  sectionCode: string;
  sectionName: string;
  orgUnitPath: string;
  photoUrl?: string;
  masterFaceUrl?: string;
  active: boolean;
}

const roles = ["JE", "FE", "SDO", "EE", "SE", "CE", "ADMIN"];

const AdminHierarchyPage: React.FC = () => {
  const router = useRouter();
  const { user, authLoading, profileLoading } = useUser();

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [officers, setOfficers] = useState<Officer[]>([]);
  const [officersLoading, setOfficersLoading] = useState(false);

  const [roleFilter, setRoleFilter] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<string>("true");
  const [search, setSearch] = useState<string>("");

  const [selectedOfficer, setSelectedOfficer] = useState<Officer | null>(null);
  const [isNewOfficer, setIsNewOfficer] = useState<boolean>(false);

  // editable fields
  const [editName, setEditName] = useState<string>("");
  const [editPhone, setEditPhone] = useState<string>("");
  const [editEmail, setEditEmail] = useState<string>("");
  const [editRole, setEditRole] = useState<string>("");
  const [editDepartmentCode, setEditDepartmentCode] = useState<string>("");
  const [editDepartmentName, setEditDepartmentName] = useState<string>("");
  const [editDiscipline, setEditDiscipline] = useState<string>("");

  const [editZoneCode, setEditZoneCode] = useState<string>("");
  const [editZoneName, setEditZoneName] = useState<string>("");
  const [editCircleCode, setEditCircleCode] = useState<string>("");
  const [editCircleName, setEditCircleName] = useState<string>("");
  const [editDivisionCode, setEditDivisionCode] = useState<string>("");
  const [editDivisionName, setEditDivisionName] = useState<string>("");
  const [editSubdivisionCode, setEditSubdivisionCode] = useState<string>("");
  const [editSubdivisionName, setEditSubdivisionName] = useState<string>("");
  const [editSectionCode, setEditSectionCode] = useState<string>("");
  const [editSectionName, setEditSectionName] = useState<string>("");
  const [editActive, setEditActive] = useState<boolean>(true);

  const [savingEdit, setSavingEdit] = useState(false);
  const [globalMessage, setGlobalMessage] = useState<string | null>(null);

  const loading = authLoading || profileLoading;

  useEffect(() => {
    if (!user && !loading && typeof window !== "undefined") {
      router.replace("/");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && user.role === "ADMIN") {
      loadOfficers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, roleFilter, activeFilter, search]);

  async function loadOfficers() {
    try {
      setOfficersLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (roleFilter) params.set("role", roleFilter);
      if (activeFilter) params.set("active", activeFilter);
      if (search.trim()) params.set("search", search.trim());

      const res = await apiFetch(
        `/api/admin/hierarchy/officers?${params.toString()}`
      );
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to load officers");

      setOfficers(data.officers || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error loading officers");
    } finally {
      setOfficersLoading(false);
    }
  }

  async function handleImport() {
    try {
      setError(null);
      setSummary(null);
      setGlobalMessage(null);

      if (!file) {
        setError("Please select a CSV file first.");
        return;
      }

      const form = new FormData();
      form.append("file", file);

      setUploading(true);

      const res = await apiFetch("/api/admin/hierarchy/import-csv", {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Import failed");
      }

      setSummary({
        created: data.created || 0,
        updated: data.updated || 0,
        errors: data.errors || 0,
      });

      setGlobalMessage("CSV imported successfully.");
      await loadOfficers();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error importing CSV");
    } finally {
      setUploading(false);
    }
  }

  function openEdit(officer: Officer) {
    setIsNewOfficer(false);
    setSelectedOfficer(officer);

    // basic info
    setEditName(officer.name || "");
    setEditPhone(officer.phone || "");
    setEditEmail(officer.email || "");
    setEditRole(officer.role || "");
    setEditDepartmentCode(officer.departmentCode || "");
    setEditDepartmentName(officer.departmentName || "");
    setEditDiscipline(officer.discipline || "");

    // org path pieces
    setEditZoneCode(officer.zoneCode || "");
    setEditZoneName(officer.zoneName || "");
    setEditCircleCode(officer.circleCode || "");
    setEditCircleName(officer.circleName || "");
    setEditDivisionCode(officer.divisionCode || "");
    setEditDivisionName(officer.divisionName || "");
    setEditSubdivisionCode(officer.subdivisionCode || "");
    setEditSubdivisionName(officer.subdivisionName || "");
    setEditSectionCode(officer.sectionCode || "");
    setEditSectionName(officer.sectionName || "");
    setEditActive(officer.active);
  }

  function openNewOfficer() {
    const officer: Officer = {
      id: "",
      officerCode: "",
      name: "",
      phone: "",
      email: "",
      role: "",
      departmentCode: "PWD",
      departmentName: "PWD",
      discipline: "",
      zoneCode: "",
      zoneName: "",
      circleCode: "",
      circleName: "",
      divisionCode: "",
      divisionName: "",
      subdivisionCode: "",
      subdivisionName: "",
      sectionCode: "",
      sectionName: "",
      orgUnitPath: "",
      active: true,
    };

    setIsNewOfficer(true);
    setSelectedOfficer(officer);

    setEditName(officer.name);
    setEditPhone(officer.phone);
    setEditEmail(officer.email);
    setEditRole(officer.role);
    setEditDepartmentCode(officer.departmentCode);
    setEditDepartmentName(officer.departmentName);
    setEditDiscipline(officer.discipline || "");
    setEditZoneCode(officer.zoneCode);
    setEditZoneName(officer.zoneName);
    setEditCircleCode(officer.circleCode);
    setEditCircleName(officer.circleName);
    setEditDivisionCode(officer.divisionCode);
    setEditDivisionName(officer.divisionName);
    setEditSubdivisionCode(officer.subdivisionCode);
    setEditSubdivisionName(officer.subdivisionName);
    setEditSectionCode(officer.sectionCode);
    setEditSectionName(officer.sectionName);
    setEditActive(officer.active);
  }

  function closeEdit() {
    setSelectedOfficer(null);
    setIsNewOfficer(false);
  }

  async function handleSaveEdit() {
    if (!selectedOfficer) return;
    try {
      setSavingEdit(true);
      setError(null);
      setGlobalMessage(null);

      if (!selectedOfficer.officerCode || !selectedOfficer.officerCode.trim()) {
        setError("Officer code is required.");
        setSavingEdit(false);
        return;
      }

      const body = {
        officerCode: selectedOfficer.officerCode,
        // personal + contact
        name: editName,
        phone: editPhone,
        email: editEmail,
        // role + dept + discipline
        role: editRole,
        departmentCode: editDepartmentCode,
        departmentName: editDepartmentName,
        discipline: editDiscipline,
        // org codes
        zoneCode: editZoneCode,
        zoneName: editZoneName,
        circleCode: editCircleCode,
        circleName: editCircleName,
        divisionCode: editDivisionCode,
        divisionName: editDivisionName,
        subdivisionCode: editSubdivisionCode,
        subdivisionName: editSubdivisionName,
        sectionCode: editSectionCode,
        sectionName: editSectionName,
        active: editActive,
      };

      const url = isNewOfficer
        ? "/api/admin/hierarchy/create-officer"
        : "/api/admin/hierarchy/update-officer";

      const res = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");

      setGlobalMessage(isNewOfficer ? "Officer created successfully." : "Officer updated successfully.");
      closeEdit();
      await loadOfficers();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error saving officer");
    } finally {
      setSavingEdit(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-600">
        Loading…
      </div>
    );
  }

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-red-600">
        Not authorized
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        <header className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-semibold">Hierarchy & Roles</h1>
            <p className="text-xs text-gray-500">
              Upload full officer list via CSV and manage transfers.
            </p>
          </div>
          <Link
            href="/admin"
            className="text-xs px-3 py-1 border rounded bg-white shadow-sm"
          >
            ← Admin Home
          </Link>
        </header>

        {error && (
          <div className="bg-red-100 text-red-700 px-3 py-2 rounded text-xs">
            {error}
          </div>
        )}

        {globalMessage && (
          <div className="bg-green-50 text-green-700 px-3 py-2 rounded text-xs">
            {globalMessage}
          </div>
        )}

        {/* CSV Format Info */}
        <section className="bg-white border rounded p-3 text-xs">
          <div className="font-medium mb-1">CSV Format</div>
          <p className="mb-1 text-[11px] text-gray-600">
            Columns (in order): officerCode, name, phone, email, role,
            departmentCode, departmentName, discipline, zoneCode, zoneName,
            circleCode, circleName, divisionCode, divisionName,
            subdivisionCode, subdivisionName, sectionCode, sectionName, active
          </p>
          <p className="text-[11px] text-gray-500 mb-2">
            role: JE, FE, SDO, EE, SE, CE, ADMIN. discipline: CIVIL, ELECTRICAL,
            MECHANICAL, or any label you use. active: TRUE/FALSE or 1/0. Face
            photo will be captured by the officer on first login.
          </p>

          <Link
            href="/api/admin/hierarchy/template"
            className="inline-block bg-gray-800 text-white px-3 py-1 rounded text-[11px]"
          >
            Download blank CSV template
          </Link>
        </section>

        {/* CSV Upload */}
        <section className="bg-white border rounded p-3 text-xs space-y-3">
          <div className="font-medium mb-1">Bulk Upload Officers (CSV)</div>

          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f);
              setSummary(null);
              setError(null);
              setGlobalMessage(null);
            }}
            className="text-[11px]"
          />

          {file && (
            <div className="text-[11px] text-gray-600">
              Selected: <b>{file.name}</b> ({Math.round(file.size / 1024)} KB)
            </div>
          )}

          <button
            disabled={!file || uploading}
            onClick={handleImport}
            className="bg-blue-600 text-white px-3 py-1 rounded text-xs disabled:opacity-60"
          >
            {uploading ? "Importing…" : "Import CSV"}
          </button>

          {summary && (
            <div className="bg-green-50 text-green-700 px-2 py-1 rounded mt-2 text-[11px]">
              Imported successfully. Created: {summary.created}, Updated:{" "}
              {summary.updated}, Errors: {summary.errors}
            </div>
          )}
        </section>

        {/* Filters + Officers table */}
        <section className="bg-white border rounded p-3 text-xs space-y-2">
          <div className="flex flex-wrap gap-2 items-end justify-between">
            <div className="flex flex-wrap gap-2">
              <div>
                <label className="block text-[11px] mb-1">Role</label>
                <select
                  className="border rounded px-2 py-1 text-xs"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="">All</option>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] mb-1">Active</label>
                <select
                  className="border rounded px-2 py-1 text-xs"
                  value={activeFilter}
                  onChange={(e) => setActiveFilter(e.target.value)}
                >
                  <option value="">All</option>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] mb-1">Search</label>
                <input
                  className="border rounded px-2 py-1 text-xs"
                  placeholder="Name / phone / code"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={openNewOfficer}
                className="bg-blue-600 text-white px-3 py-1 rounded text-[11px]"
              >
                + Add Officer
              </button>
              <button
                onClick={loadOfficers}
                className="bg-gray-100 px-3 py-1 rounded text-[11px] border"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-2">
            {officersLoading ? (
              <div className="text-[11px] text-gray-600">
                Loading officers…
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border text-[11px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="border px-2 py-1">Photo</th>
                      <th className="border px-2 py-1 text-left">Name</th>
                      <th className="border px-2 py-1">Role</th>
                      <th className="border px-2 py-1">Discipline</th>
                      <th className="border px-2 py-1">Phone</th>
                      <th className="border px-2 py-1">Org Path</th>
                      <th className="border px-2 py-1">Active</th>
                      <th className="border px-2 py-1">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {officers.map((o) => {
                      const imgSrc = o.photoUrl || o.masterFaceUrl || "";
                      return (
                        <tr key={o.officerCode} className="hover:bg-gray-50">
                          <td className="border px-2 py-1 text-center">
                            {imgSrc ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={imgSrc}
                                alt={o.name}
                                className="w-6 h-6 rounded-full mx-auto object-cover"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full mx-auto bg-gray-200" />
                            )}
                          </td>
                          <td className="border px-2 py-1 text-left">
                            <div className="font-medium text-[11px]">
                              {o.name || "-"}
                            </div>
                            <div className="text-[10px] text-gray-500">
                              {o.officerCode}
                            </div>
                          </td>
                          <td className="border px-2 py-1 text-center">
                            {o.role}
                          </td>
                          <td className="border px-2 py-1 text-center">
                            {o.discipline || "-"}
                          </td>
                          <td className="border px-2 py-1 text-center">
                            {o.phone}
                          </td>
                          <td className="border px-2 py-1 text-[10px]">
                            {o.orgUnitPath || "-"}
                          </td>
                          <td className="border px-2 py-1 text-center">
                            {o.active ? "Yes" : "No"}
                          </td>
                          <td className="border px-2 py-1 text-center">
                            <button
                              onClick={() => openEdit(o)}
                              className="text-blue-600 hover:underline text-[11px]"
                            >
                              Transfer / Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {officers.length === 0 && !officersLoading && (
                      <tr>
                        <td
                          colSpan={8}
                          className="border px-2 py-3 text-center text-[11px] text-gray-500"
                        >
                          No officers found. Try changing filters or import CSV.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Transfer / Edit / Add panel */}
        {selectedOfficer && (
          <div className="fixed inset-0 z-20 bg-black/30 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-4 text-xs">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <div className="font-semibold">
                    {isNewOfficer
                      ? "Add New Officer"
                      : `Edit / Transfer – ${selectedOfficer.name}`}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {isNewOfficer
                      ? "Set a unique officer code for this officer"
                      : `Code: ${selectedOfficer.officerCode}`}
                  </div>
                </div>
                <button
                  onClick={closeEdit}
                  className="text-[11px] text-gray-500"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {/* Officer code */}
                <div>
                  <label className="block text-[11px] mb-1">Officer Code</label>
                  <input
                    className="border rounded px-2 py-1 text-xs w-full"
                    value={selectedOfficer.officerCode}
                    onChange={(e) => {
                      if (isNewOfficer) {
                        setSelectedOfficer({
                          ...selectedOfficer,
                          officerCode: e.target.value,
                        });
                      }
                    }}
                    disabled={!isNewOfficer}
                  />
                </div>

                {/* Basic info */}
                <div>
                  <label className="block text-[11px] mb-1">Name</label>
                  <input
                    className="border rounded px-2 py-1 text-xs w-full"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] mb-1">Phone</label>
                    <input
                      className="border rounded px-2 py-1 text-xs w-full"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] mb-1">Email</label>
                    <input
                      className="border rounded px-2 py-1 text-xs w-full"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] mb-1">Role</label>
                    <select
                      className="border rounded px-2 py-1 text-xs w-full"
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                    >
                      <option value="">(no change)</option>
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] mb-1">
                      Discipline
                    </label>
                    <input
                      className="border rounded px-2 py-1 text-xs w-full"
                      placeholder="CIVIL / ELECTRICAL / MECH"
                      value={editDiscipline}
                      onChange={(e) => setEditDiscipline(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] mb-1">
                      Department Code
                    </label>
                    <input
                      className="border rounded px-2 py-1 text-xs w-full"
                      value={editDepartmentCode}
                      onChange={(e) =>
                        setEditDepartmentCode(e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] mb-1">
                      Department Name
                    </label>
                    <input
                      className="border rounded px-2 py-1 text-xs w-full"
                      value={editDepartmentName}
                      onChange={(e) =>
                        setEditDepartmentName(e.target.value)
                      }
                    />
                  </div>
                </div>

                {/* Org codes */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] mb-1">Zone Code</label>
                    <input
                      className="border rounded px-2 py-1 text-xs w-full"
                      value={editZoneCode}
                      onChange={(e) => setEditZoneCode(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] mb-1">Zone Name</label>
                    <input
                      className="border rounded px-2 py-1 text-xs w-full"
                      value={editZoneName}
                      onChange={(e) => setEditZoneName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] mb-1">
                      Circle Code
                    </label>
                    <input
                      className="border rounded px-2 py-1 text-xs w-full"
                      value={editCircleCode}
                      onChange={(e) => setEditCircleCode(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] mb-1">
                      Circle Name
                    </label>
                    <input
                      className="border rounded px-2 py-1 text-xs w-full"
                      value={editCircleName}
                      onChange={(e) => setEditCircleName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] mb-1">
                      Division Code
                    </label>
                    <input
                      className="border rounded px-2 py-1 text-xs w-full"
                      value={editDivisionCode}
                      onChange={(e) =>
                        setEditDivisionCode(e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] mb-1">
                      Division Name
                    </label>
                    <input
                      className="border rounded px-2 py-1 text-xs w-full"
                      value={editDivisionName}
                      onChange={(e) =>
                        setEditDivisionName(e.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] mb-1">
                      Subdivision Code
                    </label>
                    <input
                      className="border rounded px-2 py-1 text-xs w-full"
                      value={editSubdivisionCode}
                      onChange={(e) =>
                        setEditSubdivisionCode(e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] mb-1">
                      Subdivision Name
                    </label>
                    <input
                      className="border rounded px-2 py-1 text-xs w-full"
                      value={editSubdivisionName}
                      onChange={(e) =>
                        setEditSubdivisionName(e.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] mb-1">
                      Section Code
                    </label>
                    <input
                      className="border rounded px-2 py-1 text-xs w-full"
                      value={editSectionCode}
                      onChange={(e) => setEditSectionCode(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] mb-1">
                      Section Name
                    </label>
                    <input
                      className="border rounded px-2 py-1 text-xs w-full"
                      value={editSectionName}
                      onChange={(e) => setEditSectionName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-2">
                  <input
                    id="edit-active"
                    type="checkbox"
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                  />
                  <label
                    htmlFor="edit-active"
                    className="text-[11px] select-none"
                  >
                    Active
                  </label>
                </div>
              </div>

              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={closeEdit}
                  className="px-3 py-1 text-[11px] border rounded"
                >
                  Cancel
                </button>
                <button
                  disabled={savingEdit}
                  onClick={handleSaveEdit}
                  className="px-3 py-1 text-[11px] bg-blue-600 text-white rounded disabled:opacity-60"
                >
                  {savingEdit
                    ? isNewOfficer
                      ? "Creating…"
                      : "Saving…"
                    : isNewOfficer
                    ? "Create"
                    : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminHierarchyPage;
