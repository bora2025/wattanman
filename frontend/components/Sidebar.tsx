"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useLanguage } from "../lib/i18n";
import { useTheme } from "../lib/appearance/theme";
import { iconMap, IconGlobe, IconLogout, IconSun, IconMoon } from "./Icons";

/** Renders an icon: if `key` maps to an SVG component, uses it; otherwise falls back to text/emoji. */
function NavIcon({
  icon,
  size = 20,
  className,
}: {
  icon: string;
  size?: number;
  className?: string;
}) {
  const Comp = iconMap[icon];
  if (Comp) return <Comp size={size} className={className} />;
  return (
    <span
      className={`leading-none ${className || ""}`}
      style={{ fontSize: size }}
    >
      {icon}
    </span>
  );
}

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  /** If set, renders a section header above this item */
  section?: string;
}

interface SidebarProps {
  title: string;
  subtitle?: string;
  navItems: NavItem[];
  accentColor?: string;
  /** Which nav hrefs to show in the mobile bottom tab bar (max 5). Defaults to first 4 + settings/more. */
  bottomTabs?: string[];
}

// Phase 19: the Sidebar now follows the school's unified theme brand color
// (--brand-600 etc., app/styles.css) rather than each of these 10 names
// having its own fixed hex pair — a school's chosen primary color (Get
// Free Theme mode, plain, arbitrary, hex) reaches the Sidebar exactly the
// same way it reaches every other themed surface. All 10 non-slate keys
// below are kept and resolve identically, purely so the ~50 existing
// `<Sidebar accentColor="...">` call sites (many still hardcoded to a
// specific one of these names from before Phase 19) don't need editing —
// the actual name passed no longer changes what's rendered, only whether
// it's 'slate' (platform) or anything else (school) does.
const BRAND_ENTRY = {
  bg: "bg-brand-600",
  text: "text-white/70",
  hover: "hover:bg-white/10",
  active: "bg-white/18 text-white font-semibold",
  ring: "ring-[var(--brand-500)]",
  gradient: "from-[var(--brand-900)] to-[var(--brand-800)]",
};
const colorMap: Record<
  string,
  {
    bg: string;
    text: string;
    hover: string;
    active: string;
    ring: string;
    gradient: string;
  }
> = {
  indigo: BRAND_ENTRY,
  emerald: BRAND_ENTRY,
  sky: BRAND_ENTRY,
  teal: BRAND_ENTRY,
  violet: BRAND_ENTRY,
  rose: BRAND_ENTRY,
  amber: BRAND_ENTRY,
  blue: BRAND_ENTRY,
  fuchsia: BRAND_ENTRY,
  cyan: BRAND_ENTRY,
  // Platform tier only (frontend/app/platform/*) — deliberately distinct from
  // every school-facing accent (and NOT brand-var-driven, unlike the above)
  // so it's visually obvious which "layer" of the product a screenshot or a
  // confused support session is in, and so a school's own theme choice can
  // never bleed into the platform admin's own view.
  slate: {
    bg: "bg-slate-700",
    text: "text-slate-200",
    hover: "hover:bg-white/10",
    active: "bg-white/18 text-white font-semibold",
    ring: "ring-slate-500",
    gradient: "from-[#0f172a] to-[#1e293b]",
  },
};

function pickBottomTabs(navItems: NavItem[], bottomTabs?: string[]): NavItem[] {
  if (bottomTabs) {
    return bottomTabs
      .map((href) => navItems.find((n) => n.href === href))
      .filter(Boolean) as NavItem[];
  }

  // Auto-pick: first item (dashboard) + up to 3 most important + last (settings)
  if (navItems.length <= 5) return navItems;
  const picked = [navItems[0]];
  // Find scan/attendance, reports, classes/users
  const priorities = [
    "users",
    "search",
    "extensions",
    "settings",
  ];
  for (const p of priorities) {
    if (picked.length >= 4) break;
    const match = navItems.find(
      (n) => n.href.includes(p) && !picked.includes(n),
    );
    if (match) picked.push(match);
  }
  // Fill remaining slots
  for (const n of navItems.slice(1)) {
    if (picked.length >= 4) break;
    if (!picked.includes(n)) picked.push(n);
  }
  // Add a "More" entry
  picked.push({ label: "common.more", href: "__more__", icon: "settings" });
  return picked;
}

export default function Sidebar({
  title,
  subtitle,
  navItems,
  accentColor = "indigo",
  bottomTabs,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const colors = colorMap[accentColor] || colorMap.indigo;
  const { lang, setLang, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const navRef = useRef<HTMLElement>(null);
  const [extensionNavItems, setExtensionNavItems] = useState<NavItem[]>([]);

  useEffect(() => {
    let active = true;
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
    fetch(`${apiBase}/api/extensions/navigation`, { credentials: "include" })
      .then((response) => (response.ok ? response.json() : []))
      .then((items) => {
        if (active && Array.isArray(items)) setExtensionNavItems(items);
      })
      .catch(() => {
        /* platform host or unavailable runtime — keep core navigation */
      });
    return () => {
      active = false;
    };
  }, []);
  const effectiveNavItems = [
    ...navItems,
    ...extensionNavItems.filter(
      (item) => !navItems.some((core) => core.href === item.href),
    ),
  ];

  // Scroll the active nav item into view whenever the page changes
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const activeEl = nav.querySelector<HTMLElement>('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [pathname]);

  const visibleNavItems = effectiveNavItems;

  const tabs = pickBottomTabs(visibleNavItems, bottomTabs);
  const hasMore = tabs.some((t) => t.href === "__more__");


  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
    localStorage.removeItem("role");
    router.push("/login");
  };

  return (
    <>
      {/* ── Mobile: Top greeting bar ── */}
      <div className="lg:hidden print:hidden mobile-topbar-wrap">
        <div
          className="mobile-topbar"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div>
            <h1
              className="font-bold text-lg leading-tight"
              style={{ color: "var(--color-text)" }}
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className="text-xs"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="w-10 h-10 rounded-full bg-white/90 dark:bg-slate-800/90 backdrop-blur flex items-center justify-center shadow-sm ring-1 ring-white/70 dark:ring-slate-600/70"
              style={{ color: "var(--color-icon)" }}
              aria-label={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              {theme === "dark" ? (
                <IconSun size={20} />
              ) : (
                <IconMoon size={20} />
              )}
            </button>
            <button
              onClick={() => setLang(lang === "en" ? "kh" : "en")}
              className="w-10 h-10 rounded-full bg-white/90 dark:bg-slate-800/90 backdrop-blur flex items-center justify-center shadow-sm ring-1 ring-white/70 dark:ring-slate-600/70"
              style={{ color: "var(--color-icon)" }}
              aria-label="Language"
            >
              <IconGlobe size={20} />
            </button>
            <button
              onClick={handleLogout}
              className="w-10 h-10 rounded-full bg-white/90 dark:bg-slate-800/90 backdrop-blur flex items-center justify-center shadow-sm ring-1 ring-white/70 dark:ring-slate-600/70"
              style={{ color: "var(--color-icon)" }}
              aria-label="Logout"
            >
              <IconLogout size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile: Bottom tab bar (matches mobile app) ── */}
      <div
        className="lg:hidden print:hidden mobile-bottomnav-wrap"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <nav className="mobile-bottomnav">
          {tabs.map((tab, idx) => {
            if (tab.href === "__more__") {
              return (
                <button
                  key="more"
                  onClick={() => {
                    setShowMore(true);
                    setCollapsed(true);
                  }}
                  className="mobile-tab-btn"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  <NavIcon icon={tab.icon} size={22} />
                </button>
              );
            }
            const isActive = pathname === tab.href;
            const isCameraCenter = tabs.length === 5 && idx === 2;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`mobile-tab-btn ${isCameraCenter ? "mobile-tab-camera" : ""}`}
                style={{
                  color: isActive
                    ? "var(--color-primary)"
                    : "var(--color-text-secondary)",
                }}
              >
                <NavIcon icon={tab.icon} size={22} />
                {isActive && (
                  <span
                    className="mobile-tab-indicator"
                    style={{ background: "var(--color-primary)" }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── Mobile: Full-screen "More" drawer ── */}
      {collapsed && showMore && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/40 z-50"
            onClick={() => {
              setCollapsed(false);
              setShowMore(false);
            }}
          />
          <div
            className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 rounded-t-2xl shadow-2xl max-h-[80vh] overflow-y-auto"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: "var(--color-input-border)" }}
            >
              <h2
                className="font-bold text-lg"
                style={{ color: "var(--color-text)" }}
              >
                {t("common.more") || "More"}
              </h2>
              <button
                onClick={() => {
                  setCollapsed(false);
                  setShowMore(false);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "var(--color-input-bg)" }}
              >
                ✕
              </button>
            </div>
            <nav className="px-3 py-3">
              {visibleNavItems
                .filter((item) => !tabs.some((t) => t.href === item.href))
                .map((item) => {
                  const isExact = pathname === item.href;
                  const isParent =
                    !isExact &&
                    item.href !== "/" &&
                    item.href.length > 1 &&
                    navItems.some(
                      (n) =>
                        n.href !== item.href &&
                        n.href.startsWith(item.href + "/"),
                    ) &&
                    pathname.startsWith(item.href + "/");
                  const isActive = isExact || isParent;
                  const isChild = navItems.some(
                    (n) =>
                      n.href !== item.href &&
                      n.href.length > 1 &&
                      item.href.startsWith(n.href + "/"),
                  );
                  return (
                    <div key={item.href}>
                      {item.section && (
                        <p
                          className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest"
                          style={{
                            color: "var(--color-text-secondary)",
                            opacity: 0.6,
                          }}
                        >
                          {t(item.section)}
                        </p>
                      )}
                      <Link
                        href={item.href}
                        onClick={() => {
                          setCollapsed(false);
                          setShowMore(false);
                        }}
                        className={`relative flex items-center gap-3 py-2.5 rounded-xl text-sm transition-all ${isChild ? "ml-3 pl-5 pr-4" : "px-4"}`}
                        style={{
                          background: isExact
                            ? "var(--color-primary-light)"
                            : isParent
                              ? "rgba(var(--color-primary-rgb, 79 70 229) / 0.08)"
                              : "transparent",
                          color: isActive
                            ? "var(--color-primary-dark)"
                            : "var(--color-text)",
                          fontWeight: isExact ? 600 : isParent ? 500 : 400,
                        }}
                      >
                        {isActive && (
                          <span
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-1/2 rounded-r-full"
                            style={{ background: "var(--color-primary)" }}
                          />
                        )}
                        {isChild && (
                          <span className="absolute left-3 top-0 bottom-0 w-px bg-gray-200 dark:bg-slate-700" />
                        )}
                        <NavIcon icon={item.icon} size={isChild ? 18 : 22} />
                        <span className={isChild ? "text-[13px]" : ""}>
                          {t(item.label)}
                        </span>
                      </Link>
                    </div>
                  );
                })}
            </nav>
            <div className="px-3 pb-4 space-y-0.5">
              <Link
                href="/"
                onClick={() => {
                  setCollapsed(false);
                  setShowMore(false);
                }}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <NavIcon icon="dashboard" size={22} />
                <span>{t("common.backToHome")}</span>
              </Link>
            </div>
          </div>
        </>
      )}

      {/* ── Mobile: Slide-in sidebar for hamburger (legacy, hidden if bottom nav is used) ── */}
      {collapsed && !showMore && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setCollapsed(false)}
        />
      )}

      {/* ── Desktop: Full sidebar ── */}
      <aside
        className={`
        hidden lg:flex lg:sticky top-0 left-0 z-50 lg:z-auto
        h-screen bg-gradient-to-b ${colors.gradient} text-white
        flex-col shadow-2xl transition-all duration-200 overflow-hidden
        ${sidebarOpen ? "w-64" : "w-14"}
      `}
      >
        {/* Logo area */}
        <div className="px-3 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 hover:bg-white/20 transition-all duration-150"
              style={{ background: "rgba(255,255,255,0.13)" }}
            >
              {sidebarOpen ? (
                <svg
                  viewBox="0 0 20 20"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                >
                  <path d="M5 7l-3 3 3 3M3 10h14M15 7l3 3-3 3" />
                </svg>
              ) : (
                <span>{title.charAt(0)}</span>
              )}
            </button>
            {sidebarOpen && (
              <div className="min-w-0">
                <h1 className="font-bold text-sm leading-tight truncate">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-[11px] text-white/50 mt-0.5 truncate">
                    {subtitle}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav
          ref={navRef}
          className="flex-1 px-2 py-3 overflow-y-auto overscroll-contain scroll-smooth"
        >
          {/* Back to Home */}
          <Link
            href="/"
            title={sidebarOpen ? undefined : t("common.backToHome")}
            className={`flex items-center gap-3 px-2.5 py-2 mb-1 rounded-xl text-sm ${colors.text} hover:bg-white/10 transition-colors ${sidebarOpen ? "" : "justify-center"}`}
          >
            <svg
              viewBox="0 0 20 20"
              className="shrink-0"
              width={17}
              height={17}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 4l-6 6 6 6" />
            </svg>
            {sidebarOpen && (
              <span className="truncate text-white/70">
                {t("common.backToHome")}
              </span>
            )}
          </Link>
          <div
            className={`border-t border-white/10 mb-2 ${sidebarOpen ? "mx-1" : "mx-0"}`}
          />
          {visibleNavItems.map((item, idx) => {
            // ── Active state detection ──────────────────────────────────
            // isExact: user is on exactly this page
            const isExact = pathname === item.href;
            // isParent: this item is a parent and a child page is currently open
            const isParent =
              !isExact &&
              item.href !== "/" &&
              item.href.length > 1 &&
              navItems.some(
                (n) =>
                  n.href !== item.href && n.href.startsWith(item.href + "/"),
              ) &&
              pathname.startsWith(item.href + "/");
            const isActive = isExact || isParent;

            // isChild: this item lives under a parent that exists in navItems
            const parentHref = navItems.find(
              (n) =>
                n.href !== item.href &&
                n.href.length > 1 &&
                item.href.startsWith(n.href + "/"),
            )?.href;
            const isChild = !!parentHref;

            return (
              <div key={item.href}>
                {sidebarOpen && item.section && (
                  <p
                    className={`px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/40 ${idx === 0 ? "pt-0" : "pt-4"}`}
                  >
                    {t(item.section)}
                  </p>
                )}
                <Link
                  href={item.href}
                  data-active={isActive ? "true" : undefined}
                  title={sidebarOpen ? undefined : t(item.label)}
                  className={`relative flex items-center gap-3 rounded-xl text-sm transition-all duration-150
                    ${isChild && sidebarOpen ? "ml-3 pl-5 pr-2.5 py-1.5" : "px-2.5 py-2"}
                    ${
                      isExact
                        ? "bg-white/20 text-white font-semibold shadow-sm"
                        : isParent
                          ? "bg-white/10 text-white font-medium"
                          : `${colors.text} ${colors.hover}`
                    }
                    ${sidebarOpen ? "" : "justify-center"}
                  `}
                >
                  {/* Left accent bar for active items */}
                  {sidebarOpen && isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-white"
                      style={{
                        height: isExact ? "60%" : "40%",
                        opacity: isExact ? 1 : 0.6,
                      }}
                    />
                  )}
                  {/* Tree connector line for child items */}
                  {isChild && sidebarOpen && (
                    <span className="absolute left-3 top-0 bottom-0 w-px bg-white/20" />
                  )}
                  <NavIcon
                    icon={item.icon}
                    size={isChild ? 15 : 17}
                    className={isActive ? "opacity-100" : "opacity-80"}
                  />
                  {sidebarOpen && (
                    <span
                      className={`truncate flex-1 ${isChild ? "text-[13px]" : ""}`}
                    >
                      {t(item.label)}
                    </span>
                  )}
                  {/* Active dot for collapsed mode */}
                  {!sidebarOpen && isActive && (
                    <span className="absolute right-0.5 top-0.5 w-2 h-2 rounded-full bg-white" />
                  )}
                </Link>
              </div>
            );
          })}
        </nav>

        {/* Bottom — compact, icon-only regardless of expand state */}
        <div
          className={`px-2 py-2 border-t border-white/10 flex items-center gap-0.5 ${sidebarOpen ? "justify-center" : "flex-col"}`}
        >
          <button
            onClick={toggleTheme}
            title={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            className={`w-9 h-9 rounded-xl flex items-center justify-center ${colors.text} hover:bg-white/10 transition-colors`}
          >
            {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
          <button
            onClick={() => setLang(lang === "en" ? "kh" : "en")}
            title={lang === "en" ? "ភាសាខ្មែរ" : "English"}
            className={`w-9 h-9 rounded-xl flex items-center justify-center ${colors.text} hover:bg-white/10 transition-colors`}
          >
            <IconGlobe size={16} />
          </button>
          <Link
            href="/settings/notifications"
            title="Notification settings"
            className={`w-9 h-9 rounded-xl flex items-center justify-center ${colors.text} hover:bg-white/10 transition-colors`}
          >
            <NavIcon icon="settings" size={16} />
          </Link>
          <button
            onClick={handleLogout}
            title={t("common.logout")}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-red-300/90 hover:bg-white/10 transition-colors"
          >
            <IconLogout size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}
