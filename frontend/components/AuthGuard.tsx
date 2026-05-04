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
    // Verify auth by calling the API (cookie is sent automatically)
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Not authenticated');
        const user = await res.json();
        // Check role if required
        if (!isRoleAllowed(user.role, requiredRole, allowedRoles)) {
          router.push(loginUrl);
          return;
        }
        localStorage.setItem('role', user.role);
        setIsAuthenticated(true);
        setIsLoading(false);
      })
      .catch(() => {
        // Try refreshing the token first
        fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
          .then(async (refreshRes) => {
            if (!refreshRes.ok) throw new Error('Refresh failed');
            // Retry /me
            const retryRes = await fetch('/api/auth/me', { credentials: 'include' });
            if (!retryRes.ok) throw new Error('Still not authenticated');
            const user = await retryRes.json();
            if (!isRoleAllowed(user.role, requiredRole, allowedRoles)) {
              router.push(loginUrl);
              return;
            }
            localStorage.setItem('role', user.role);
            setIsAuthenticated(true);
            setIsLoading(false);
          })
          .catch(() => {
            localStorage.removeItem('role');
            router.push(loginUrl);
          });
      });
  }, [router, requiredRole, allowedRoles, loginUrl]);

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