// pages/admin/index.tsx

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useUser } from "@/lib/useUser";

const cards = [
  {
    key: "projects",
    title: "Projects & Packages",
    description:
      "Create new works, define packages and map the correct JE / FE owner. Review division-wise risk indicators.",
    href: "/admin/projects",
  },
  {
    key: "hierarchy",
    title: "Officer Hierarchy",
    description:
      "Manage officers and organisational hierarchy using CSV upload / update. This controls which officer sees which projects.",
    href: "/admin/hierarchy",
  },
  {
    key: "reports",
    title: "Monitoring & Reports",
    description:
      "View consolidated progress, risk, attendance and field activity for HQ review and monthly monitoring meetings.",
    href: "/admin/reports",
  },
];

const AdminHome: React.FC = () => {
  const router = useRouter();
  const { user, authLoading, profileLoading } = useUser();

  // Redirect non-admins away from admin home
  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (user.role !== "ADMIN") {
      router.replace("/");
    }
  }, [user, authLoading, profileLoading, router]);

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-600">
        Loading…
      </div>
    );
  }

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-red-600">
        Not authorised to view this page.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <header className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-semibold">HQ Admin Console</h1>
            <p className="text-xs text-gray-500">
              Use these sections to set up officer hierarchy, create projects & packages,
              and monitor progress. Once configured, field officers will work
              independently through their own dashboards.
            </p>
          </div>
          <div className="text-[11px] text-gray-500 text-right">
            <div>
              Logged in as{" "}
              <span className="font-medium">
                {user.name || user.phone || "Admin"}
              </span>
            </div>
            {user.departmentId && (
              <div className="mt-0.5">
                Dept: <span className="font-medium">{user.departmentId}</span>
              </div>
            )}
          </div>
        </header>

        <section className="grid md:grid-cols-3 gap-4">
          {cards.map((card) => (
            <Link
              key={card.key}
              href={card.href}
              className="block bg-white border rounded-lg shadow-sm hover:shadow-md transition-shadow p-4"
            >
              <div className="text-sm font-semibold mb-1">{card.title}</div>
              <p className="text-[11px] text-gray-600 leading-snug">
                {card.description}
              </p>
            </Link>
          ))}
        </section>

        <section className="bg-white border rounded p-3 text-xs text-gray-600 space-y-1">
          <div className="font-medium text-[11px] mb-1">Suggested working flow</div>
          <ol className="list-decimal list-inside space-y-1">
            <li>
              <span className="font-semibold">Officer Hierarchy:</span>{" "}
              Upload / update the officers CSV, verify transfers and ensure that
              discipline and orgUnitPath are correct for each officer.
            </li>
            <li>
              <span className="font-semibold">Projects & Packages:</span>{" "}
              Create projects for each sanctioned work and create packages under
              them with the correct JE / FE owner for execution.
            </li>
            <li>
              <span className="font-semibold">Monitoring & Reports:</span>{" "}
              Use reports to monitor risk, attendance and site activity during
              review meetings. Field officers will only see works as per the
              hierarchy defined above.
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
};

export default AdminHome;
