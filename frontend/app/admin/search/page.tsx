"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "../../../components/Sidebar";
import AuthGuard from "../../../components/AuthGuard";
import { adminNav } from "../../../lib/admin-nav";
import { apiFetch } from "../../../lib/api";

interface UserResult {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  photo: string | null;
  role: string;
  createdAt: string;
}

function SearchContent() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("ALL");
  const [users, setUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const search = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (role !== "ALL") params.set("role", role);
      const response = await apiFetch(`/api/auth/users/search?${params}`);
      const data = await response.json().catch(() => []);
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      setUsers(Array.isArray(data) ? data : []);
    } catch (searchError: any) {
      setError(searchError.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }, [query, role]);

  useEffect(() => {
    const timer = setTimeout(search, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const roles = ["ALL", ...Array.from(new Set(users.map((user) => user.role)))];

  return (
    <div className="page-shell">
      <Sidebar title="Admin" subtitle="School Management" navItems={adminNav} />
      <main className="page-content">
        <div className="page-header">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Search</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Find accounts in this school by name, email, phone, or role.
          </p>
        </div>

        <div className="page-body space-y-4">
          <section className="card p-4 flex flex-col md:flex-row gap-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search users"
              className="flex-1"
              autoFocus
            />
            <select value={role} onChange={(event) => setRole(event.target.value)} className="md:w-48">
              {roles.map((item) => (
                <option key={item} value={item}>
                  {item === "ALL" ? "All roles" : item.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </section>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <section className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">School users</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">{users.length} results</span>
            </div>

            {loading ? (
              <div className="p-10 text-center text-sm text-slate-500">Searching…</div>
            ) : users.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No matching users found.</div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {users.map((user) => (
                  <article key={user.id} className="p-4 flex items-center gap-3">
                    {user.photo ? (
                      <img src={user.photo} alt="" className="h-11 w-11 rounded-xl object-cover" />
                    ) : (
                      <div className="h-11 w-11 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-bold">
                        {user.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">{user.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {user.email || user.phone || "No contact information"}
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      {user.role.replaceAll("_", " ")}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default function SearchPage() {
  return (
    <AuthGuard requiredRole="ADMIN">
      <SearchContent />
    </AuthGuard>
  );
}
