import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import CompaniesPage from "@/pages/CompaniesPage";
import HistoryPage from "@/pages/HistoryPage";
import SettingsPage from "@/pages/SettingsPage";
import UsersPage from "@/pages/UsersPage";
import SystemAlertsPage from "@/pages/SystemAlertsPage";
import AccountPage from "@/pages/AccountPage";
import AppLayout from "@/components/AppLayout";
import { Toaster } from "sonner";
import "@/App.css";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="text-zinc-500 font-mono text-sm">Se incarca...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="text-zinc-500 font-mono text-sm">Se incarca...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: { background: '#18181b', border: '1px solid #27272a', color: '#fff' }
          }}
        />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="companies" element={<AdminRoute><CompaniesPage /></AdminRoute>} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="system-alerts" element={<SystemAlertsPage />} />
            <Route path="settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
            <Route path="users" element={<AdminRoute><UsersPage /></AdminRoute>} />
            <Route path="account" element={<AccountPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
