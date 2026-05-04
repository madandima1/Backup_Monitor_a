import React from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  ChartBar,
  Buildings,
  ClockCounterClockwise,
  GearSix,
  SignOut,
  ShieldCheck,
  Bell,
  UsersThree,
  Lightning,
  User as UserIcon
} from "@phosphor-icons/react";
import { useState, useEffect } from "react";
import { getAlerts, getSystemAlerts } from "@/lib/api";

const navItems = [
  { to: "/", label: "Panou de Control", icon: ChartBar, exact: true },
  { to: "/companies", label: "Companii", icon: Buildings, adminOnly: true },
  { to: "/history", label: "Istoric", icon: ClockCounterClockwise },
  { to: "/system-alerts", label: "Alerte Sistem", icon: Lightning },
  { to: "/users", label: "Utilizatori", icon: UsersThree, adminOnly: true },
  { to: "/settings", label: "Setari", icon: GearSix, adminOnly: true },
  { to: "/account", label: "Contul Meu", icon: UserIcon },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [alertCount, setAlertCount] = useState(0);
  const [sysAlertCount, setSysAlertCount] = useState(0);

  useEffect(() => {
    getAlerts().then(a => setAlertCount(a.length)).catch(() => {});
    getSystemAlerts({ limit: 1 }).then(d => setSysAlertCount(d.total || 0)).catch(() => {});
    const interval = setInterval(() => {
      getAlerts().then(a => setAlertCount(a.length)).catch(() => {});
      getSystemAlerts({ limit: 1 }).then(d => setSysAlertCount(d.total || 0)).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-black flex" data-testid="app-layout">
      {/* Sidebar */}
      <aside className="w-56 border-r border-zinc-800 bg-zinc-950 flex flex-col fixed h-screen" data-testid="sidebar">
        {/* Logo */}
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-white rounded-sm flex items-center justify-center">
              <ShieldCheck size={18} weight="duotone" className="text-black" />
            </div>
            <div>
              <div className="text-sm font-bold text-white tracking-tight" style={{ fontFamily: 'Chivo, sans-serif' }}>
                Backup Monitor
              </div>
              <div className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.15em]">
                v1.0
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.filter(item => !item.adminOnly || user?.role === "admin").map((item) => {
            const isActive = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                data-testid={`nav-${item.to === "/" ? "dashboard" : item.to.slice(1)}`}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-sm text-sm transition-all duration-200 ${
                  isActive
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-500 hover:text-white hover:bg-zinc-900"
                }`}
              >
                <Icon size={18} weight={isActive ? "duotone" : "regular"} />
                {item.label}
                {item.to === "/" && alertCount > 0 && (
                  <span className="ml-auto bg-rose-500/20 text-rose-400 text-[10px] font-mono px-1.5 py-0.5 rounded-sm">
                    {alertCount}
                  </span>
                )}
                {item.to === "/system-alerts" && sysAlertCount > 0 && (
                  <span className="ml-auto bg-amber-500/20 text-amber-400 text-[10px] font-mono px-1.5 py-0.5 rounded-sm">
                    {sysAlertCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-zinc-800">
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-7 h-7 rounded-sm bg-zinc-800 flex items-center justify-center text-xs font-mono text-zinc-400">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-white truncate">{user?.name || "Utilizator"}</div>
              <div className="text-[10px] text-zinc-600 truncate font-mono">{user?.email}</div>
            </div>
            <button
              onClick={logout}
              className="text-zinc-600 hover:text-rose-400 transition-colors"
              data-testid="logout-button"
              title="Deconectare"
            >
              <SignOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 ml-56 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
