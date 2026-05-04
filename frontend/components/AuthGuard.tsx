'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: string;
  allowedRoles?: string[];
}

const EMPLOYEE_EXCLUDED_ROLES = ['ADMIN', 'TEACHER', 'STUDENT', 'WATTAMAN'];

function isRoleAllowed(userRole: string, requiredRole?: string, allowedRoles?: string[]): boolean {
  if (allowedRoles && allowedRoles.length > 0) {
    // Check explicit role match first
    if (allowedRoles.includes(userRole)) return true;
    // Special meta-role: EMPLOYEE means any role not in excluded list
    if (allowedRoles.includes('EMPLOYEE')) {
      return !EMPLOYEE_EXCLUDED_ROLES.includes(userRole);
    }
    return false;
  }
  if (requiredRole) {
    return userRole === requiredRole;
  }
  return true; // no restriction
}

export default function AuthGuard({ children, requiredRole, allowedRoles }: AuthGuardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const loginUrl = `/login?returnTo=${encodeURIComponent(pathname)}`;

  useEffect(() => {
    // Capture values at mount time — these are stable for any given page
    const _requiredRole = requiredRole;
    const _allowedRoles = allowedRoles;
    const _loginUrl = loginUrl;
    let cancelled = false;

    async function checkAuth() {
      try {
        let res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) {
          // Try refreshing once
          const refreshRes = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
          if (!refreshRes.ok) throw new Error('Refresh failed');
          res = await fetch('/api/auth/me', { credentials: 'include' });
          if (!res.ok) throw new Error('Still not authenticated');
        }
        if (cancelled) return;
        const user = await res.json();
        if (!isRoleAllowed(user.role, _requiredRole, _allowedRoles)) {
          router.push(_loginUrl);
          return;
        }
        localStorage.setItem('role', user.role);
        setIsAuthenticated(true);
        setIsLoading(false);
      } catch {
        if (cancelled) return;
        localStorage.removeItem('role');
        router.push(_loginUrl);
      }
    }

    checkAuth();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Proactively refresh the access token every 10 minutes so it never expires mid-session
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' }).catch(() => {});
    }, 10 * 60 * 1000); // 10 minutes
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-slate-500 mt-3">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  return <>{children}</>;
}