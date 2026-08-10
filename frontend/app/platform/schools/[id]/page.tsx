"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "../../../../components/Sidebar";
import AuthGuard from "../../../../components/AuthGuard";
import { platformNav } from "../../../../lib/platform-nav";
import { apiFetch } from "../../../../lib/api";

interface SchoolDetail {
  id: string;
  name: string;
  subdomain: string;
  customDomain: string | null;
  status: string;
  createdAt: string;
  counts: { students: number; staff: number; classes: number };
}

interface SchoolDomain {
  id: string;
  hostname: string;
  type: string;
  status: string;
  verificationToken: string | null;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  verificationError: string | null;
  routingStatus: string;
  routingCheckedAt: string | null;
  routingError: string | null;
}

const SCHOOL_ROOT_DOMAIN =
  process.env.NEXT_PUBLIC_SCHOOL_ROOT_DOMAIN || "wattaman.app";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:
    "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
  SUSPENDED:
    "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900",
  TRIAL:
    "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900",
};

function SchoolDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "danger">("overview");

  const [statusBusy, setStatusBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const [reason, setReason] = useState("");
  const [impersonating, setImpersonating] = useState(false);
  const [impersonateError, setImpersonateError] = useState("");

  const [resetReason, setResetReason] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetResult, setResetResult] = useState<{
    email: string;
    temporaryPassword: string;
  } | null>(null);
  const [resetCopied, setResetCopied] = useState(false);

  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [domainChecking, setDomainChecking] = useState(false);
  const [domainResult, setDomainResult] = useState<{
    domain: string | null;
    domainProvisioned: boolean;
    domainError: string | null;
  } | null>(null);
  const [domains, setDomains] = useState<SchoolDomain[]>([]);
  const [customHostname, setCustomHostname] = useState("");
  const [domainBusy, setDomainBusy] = useState("");
  const [domainError, setDomainError] = useState("");

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    try {
      const [schoolResponse, domainsResponse] = await Promise.all([
        apiFetch(`/api/platform/schools/${id}`),
        apiFetch(`/api/platform/schools/${id}/domains`),
      ]);
      if (!schoolResponse.ok) throw new Error(`HTTP ${schoolResponse.status}`);
      setSchool(await schoolResponse.json());
      if (domainsResponse.ok) setDomains(await domainsResponse.json());
    } catch {
      setError("Failed to load school");
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus(newStatus: "ACTIVE" | "SUSPENDED") {
    if (!school) return;
    setStatusBusy(true);
    setStatusMsg("");
    try {
      const res = await apiFetch(`/api/platform/schools/${school.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `HTTP ${res.status}`);
      }
      setSchool(await res.json());
      setStatusMsg(
        newStatus === "SUSPENDED"
          ? "School suspended — access is now blocked immediately."
          : "School reactivated.",
      );
    } catch (e: any) {
      setStatusMsg(e.message || "Failed to update status");
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleImpersonate() {
    if (!school || !reason.trim()) return;
    setImpersonating(true);
    setImpersonateError("");
    try {
      const res = await apiFetch(
        `/api/platform/schools/${school.id}/impersonate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      const bridgeUrl = `${window.location.protocol}//${school.subdomain}.${SCHOOL_ROOT_DOMAIN}/session-bridge?token=${encodeURIComponent(data.access_token)}`;
      window.open(bridgeUrl, "_blank", "noopener,noreferrer");
      setReason("");
    } catch (e: any) {
      setImpersonateError(e.message || "Failed to start impersonation session");
    } finally {
      setImpersonating(false);
    }
  }

  async function handleResetPassword() {
    if (!school || !resetReason.trim()) return;
    setResetting(true);
    setResetError("");
    try {
      const res = await apiFetch(
        `/api/platform/schools/${school.id}/reset-admin-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: resetReason.trim() }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setResetResult({
        email: data.email,
        temporaryPassword: data.temporaryPassword,
      });
      setResetReason("");
    } catch (e: any) {
      setResetError(e.message || "Failed to reset password");
    } finally {
      setResetting(false);
    }
  }

  function copyResetPassword() {
    if (!resetResult) return;
    navigator.clipboard?.writeText(resetResult.temporaryPassword).then(() => {
      setResetCopied(true);
      setTimeout(() => setResetCopied(false), 2000);
    });
  }

  async function checkDomain() {
    if (!school) return;
    setDomainChecking(true);
    try {
      const res = await apiFetch(
        `/api/platform/schools/${school.id}/retry-domain`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setDomainResult(data);
    } catch (e: any) {
      setDomainResult({
        domain: null,
        domainProvisioned: false,
        domainError: e.message || "Failed to check domain",
      });
    } finally {
      setDomainChecking(false);
    }
  }

  async function registerCustomDomain() {
    if (!school || !customHostname.trim()) return;
    setDomainBusy("register");
    setDomainError("");
    try {
      const response = await apiFetch(
        `/api/platform/schools/${school.id}/domains`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hostname: customHostname.trim() }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      setCustomHostname("");
      await loadDomains();
    } catch (e: any) {
      setDomainError(e.message || "Failed to register custom domain");
    } finally {
      setDomainBusy("");
    }
  }

  async function verifyCustomDomain(domainId: string) {
    if (!school) return;
    setDomainBusy(domainId);
    setDomainError("");
    try {
      const response = await apiFetch(
        `/api/platform/schools/${school.id}/domains/${domainId}/verify`,
        { method: "POST" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      if (!data.verified) setDomainError(data.error || "Domain is not verified yet");
      await loadDomains();
    } catch (e: any) {
      setDomainError(e.message || "Failed to verify custom domain");
    } finally {
      setDomainBusy("");
    }
  }

  async function retryDomainRouting(domainId: string) {
    if (!school) return;
    setDomainBusy(`routing-${domainId}`);
    setDomainError("");
    try {
      const response = await apiFetch(
        `/api/platform/schools/${school.id}/domains/${domainId}/retry-routing`,
        { method: "POST" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      if (!data.routed) setDomainError(data.routingError || "Domain routing is not ready");
      await loadDomains();
    } catch (e: any) {
      setDomainError(e.message || "Failed to provision domain routing");
    } finally {
      setDomainBusy("");
    }
  }

  async function loadDomains() {
    const response = await apiFetch(`/api/platform/schools/${id}/domains`);
    if (response.ok) setDomains(await response.json());
  }

  async function handleDelete() {
    if (!school || confirmName !== school.name) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await apiFetch(`/api/platform/schools/${school.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `HTTP ${res.status}`);
      }
      router.push("/platform/schools");
    } catch (e: any) {
      setDeleteError(e.message || "Failed to delete school");
      setDeleting(false);
    }
  }

  return (
    <div className="page-shell">
      <Sidebar
        title="Platform"
        subtitle="Wattaman"
        navItems={platformNav}
        accentColor="slate"
      />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <Link
            href="/platform/schools"
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-2 inline-flex items-center gap-1"
          >
            ← Back to Schools
          </Link>
          {school && (
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                {school.name}
              </h1>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[school.status] || "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"}`}
              >
                {school.status}
              </span>
            </div>
          )}
        </div>

        <div className="page-body space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-3 border-slate-300 dark:border-slate-600 border-t-slate-700 rounded-full animate-spin" />
            </div>
          ) : (
            school && (
              <>
                <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
                  {(["overview", "danger"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${tab === t ? "border-slate-700 dark:border-slate-400 text-slate-800 dark:text-slate-100" : "border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"}`}
                    >
                      {t === "overview" ? "Overview" : "Danger Zone"}
                    </button>
                  ))}
                </div>

                {tab === "overview" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="stat-card">
                        <div className="stat-label">Students</div>
                        <div className="stat-value">
                          {school.counts.students}
                        </div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Staff</div>
                        <div className="stat-value">{school.counts.staff}</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Classes</div>
                        <div className="stat-value">
                          {school.counts.classes}
                        </div>
                      </div>
                    </div>
                    <div className="card p-5 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">
                          Subdomain
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-100">
                          {school.subdomain}
                        </span>
                      </div>
                      {school.customDomain && (
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">
                            Custom domain
                          </span>
                          <span className="font-medium text-slate-800 dark:text-slate-100">
                            {school.customDomain}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">
                          Created
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-100">
                          {new Date(school.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="card p-5">
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                        Live web address
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                        This deployment has no wildcard DNS — each school needs
                        its own Railway domain registered before it's reachable.
                        Check status or retry if it was never set up.
                      </p>
                      {domainResult &&
                        (domainResult.domainProvisioned &&
                        domainResult.domain ? (
                          <div className="mb-3 px-3 py-2 rounded-lg text-sm bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                            Live at{" "}
                            <a
                              href={`https://${domainResult.domain}`}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              {domainResult.domain}
                            </a>
                          </div>
                        ) : (
                          <div className="mb-3 px-3 py-2 rounded-lg text-sm bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                            Not reachable
                            {domainResult.domainError
                              ? ` — ${domainResult.domainError}`
                              : ""}
                          </div>
                        ))}
                      <button
                        onClick={checkDomain}
                        disabled={domainChecking}
                        className="btn-outline text-sm px-4 py-2 rounded-lg disabled:opacity-50"
                      >
                        {domainChecking
                          ? "Checking…"
                          : domainResult
                            ? "Recheck / Retry"
                            : "Check / Provision Domain"}
                      </button>
                    </div>

                    <div className="card p-5 space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          Verified school domains
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Custom domains remain inactive until their DNS TXT challenge is verified.
                        </p>
                      </div>

                      {domainError && (
                        <div className="px-3 py-2 rounded-lg text-xs bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900">
                          {domainError}
                        </div>
                      )}

                      <div className="space-y-3">
                        {domains.map((domain) => (
                          <div
                            key={domain.id}
                            className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div>
                                <div className="font-medium text-sm text-slate-800 dark:text-slate-100">
                                  {domain.hostname}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {domain.type}
                                </div>
                              </div>
                              <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${domain.status === "VERIFIED" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"}`}>
                                {domain.status}
                              </span>
                            </div>

                            {domain.type === "CUSTOM" && domain.status !== "VERIFIED" && domain.verificationToken && (
                              <div className="space-y-2 text-xs">
                                <p className="text-slate-600 dark:text-slate-300">
                                  Add this DNS TXT record, then verify:
                                </p>
                                <div className="grid gap-1 rounded-lg bg-slate-50 dark:bg-slate-900 p-3 font-mono break-all">
                                  <span>_wattaman-verification.{domain.hostname}</span>
                                  <span>wattaman-verification={domain.verificationToken}</span>
                                </div>
                                {domain.verificationError && (
                                  <p className="text-amber-700 dark:text-amber-300">
                                    {domain.verificationError}
                                  </p>
                                )}
                                <button
                                  onClick={() => verifyCustomDomain(domain.id)}
                                  disabled={domainBusy === domain.id}
                                  className="btn-outline text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
                                >
                                  {domainBusy === domain.id ? "Checking…" : "Verify DNS"}
                                </button>
                              </div>
                            )}
                            {domain.status === "VERIFIED" && (
                              <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
                                <div>
                                  <span className={domain.routingStatus === "READY" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}>
                                    Routing: {domain.routingStatus}
                                  </span>
                                  {domain.routingError && (
                                    <p className="text-red-600 dark:text-red-400 mt-1">
                                      {domain.routingError}
                                    </p>
                                  )}
                                </div>
                                {domain.routingStatus !== "READY" && (
                                  <button
                                    onClick={() => retryDomainRouting(domain.id)}
                                    disabled={domainBusy === `routing-${domain.id}`}
                                    className="btn-outline text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
                                  >
                                    {domainBusy === `routing-${domain.id}` ? "Provisioning…" : "Retry routing"}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          value={customHostname}
                          onChange={(event) => setCustomHostname(event.target.value)}
                          placeholder="portal.school.example"
                          className="flex-1"
                        />
                        <button
                          onClick={registerCustomDomain}
                          disabled={!customHostname.trim() || domainBusy === "register"}
                          className="btn-outline text-sm px-4 py-2 rounded-lg disabled:opacity-50"
                        >
                          {domainBusy === "register" ? "Registering…" : "Add custom domain"}
                        </button>
                      </div>
                    </div>

                    <Link
                      href="/platform/extensions"
                      className="card p-5 flex items-center justify-between gap-3 hover:shadow-md transition-all"
                    >
                      <div>
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          Extensions
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Manage the marketplace, releases, installations, and
                          billing-gated extensions.
                        </p>
                      </div>
                      <span className="text-slate-400 dark:text-slate-500">
                        →
                      </span>
                    </Link>

                    <Link
                      href={`/platform/schools/${school.id}/usage`}
                      className="card p-5 flex items-center justify-between gap-3 hover:shadow-md transition-all"
                    >
                      <div>
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          Usage &amp; Speed
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Daily activity and average request latency, to tell
                          "busy" apart from "actually slow."
                        </p>
                      </div>
                      <span className="text-slate-400 dark:text-slate-500">
                        →
                      </span>
                    </Link>

                    <div className="card p-5">
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                        View as this school
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                        Opens a new tab signed in as this school's admin. Every
                        session is audit-logged with the reason you provide, and
                        expires after 30 minutes.
                      </p>
                      {impersonateError && (
                        <div className="text-xs text-red-600 dark:text-red-400 mb-2">
                          {impersonateError}
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Reason (required — e.g. support ticket #1234)"
                          className="flex-1"
                        />
                        <button
                          onClick={handleImpersonate}
                          disabled={
                            !reason.trim() ||
                            impersonating ||
                            school.status === "SUSPENDED"
                          }
                          className="btn-outline text-sm px-4 py-2 rounded-lg whitespace-nowrap disabled:opacity-50"
                        >
                          {impersonating ? "Opening…" : "👁 View as School"}
                        </button>
                      </div>
                      {school.status === "SUSPENDED" && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                          Reactivate the school before impersonating — a
                          suspended school blocks all access, including this.
                        </p>
                      )}
                    </div>

                    <div className="card p-5">
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                        Reset admin password
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                        Generates a new temporary password for this school's
                        admin account (the same one used for impersonation) and
                        shows it once. Audit-logged with the reason you provide.
                      </p>
                      {resetError && (
                        <div className="text-xs text-red-600 dark:text-red-400 mb-2">
                          {resetError}
                        </div>
                      )}
                      {resetResult ? (
                        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl p-4 space-y-2">
                          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wide">
                            Temporary password — shown once
                          </p>
                          <div className="text-sm text-slate-700 dark:text-slate-200">
                            <span className="text-slate-500 dark:text-slate-400">
                              Email:
                            </span>{" "}
                            {resetResult.email}
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 rounded px-2 py-1 text-sm font-mono">
                              {resetResult.temporaryPassword}
                            </code>
                            <button
                              onClick={copyResetPassword}
                              className="btn-outline btn-sm"
                            >
                              {resetCopied ? "Copied!" : "Copy"}
                            </button>
                          </div>
                          <button
                            onClick={() => setResetResult(null)}
                            className="text-xs text-amber-700 dark:text-amber-300 underline mt-1"
                          >
                            Reset again
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={resetReason}
                            onChange={(e) => setResetReason(e.target.value)}
                            placeholder="Reason (required — e.g. admin lost their password)"
                            className="flex-1"
                          />
                          <button
                            onClick={handleResetPassword}
                            disabled={!resetReason.trim() || resetting}
                            className="btn-outline text-sm px-4 py-2 rounded-lg whitespace-nowrap disabled:opacity-50"
                          >
                            {resetting ? "Resetting…" : "🔑 Reset Password"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {tab === "danger" && (
                  <div className="space-y-4">
                    <div className="card p-5 border-2 border-amber-100 dark:border-amber-900">
                      <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                        {school.status === "SUSPENDED"
                          ? "Reactivate school"
                          : "Suspend school"}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                        {school.status === "SUSPENDED"
                          ? "Restores access immediately for every user at this school."
                          : "Blocks all access for this school immediately, including already-logged-in users. Use for non-payment or policy violations."}
                      </p>
                      {statusMsg && (
                        <div className="text-xs text-slate-600 dark:text-slate-300 mb-2">
                          {statusMsg}
                        </div>
                      )}
                      <button
                        onClick={() =>
                          toggleStatus(
                            school.status === "SUSPENDED"
                              ? "ACTIVE"
                              : "SUSPENDED",
                          )
                        }
                        disabled={statusBusy}
                        className={`text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-50 ${school.status === "SUSPENDED" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-amber-600 hover:bg-amber-700 text-white"}`}
                      >
                        {statusBusy
                          ? "Working…"
                          : school.status === "SUSPENDED"
                            ? "Reactivate"
                            : "Suspend"}
                      </button>
                    </div>

                    <div className="card p-5 border-2 border-red-100 dark:border-red-900">
                      <h3 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">
                        Delete school
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
                        <strong className="text-red-700 dark:text-red-300">
                          Irreversible.
                        </strong>{" "}
                        Permanently deletes {school.name} and every record it
                        owns — students, staff, attendance, fees, everything.
                        Type the school's exact name to confirm.
                      </p>
                      {deleteError && (
                        <div className="text-xs text-red-600 dark:text-red-400 mb-2">
                          {deleteError}
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={confirmName}
                          onChange={(e) => setConfirmName(e.target.value)}
                          placeholder={school.name}
                          className="flex-1"
                        />
                        <button
                          onClick={handleDelete}
                          disabled={confirmName !== school.name || deleting}
                          className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
                        >
                          {deleting ? "Deleting…" : "Delete School"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default function SchoolDetailPage() {
  return (
    <AuthGuard requiredRole="PLATFORM_ADMIN">
      <SchoolDetailContent />
    </AuthGuard>
  );
}
