'use client';

import React, { useState, useEffect } from 'react';
import LoginView from './views/LoginView';
import PaketAksesView from './views/PaketAksesView';
import AdminDashboardView from './views/AdminDashboardView';
import UserLayout from './layouts/UserLayout';
import { getUserSession, logoutUser, UserSession } from '../lib/auth';
import { initRealtimeSync } from '../lib/realtimeSync';
import { initCrossTabSync } from '../lib/crossTabSync';

export default function SatsetApp() {
  const [session, setSession] = useState<UserSession | null>(() => {
    const current = getUserSession();
    if (current && current.code === 'GUEST-ACCESS') {
      logoutUser();
      return null;
    }
    return current;
  });

  useEffect(() => {
    // Initialize central real-time sync (SSE Manager) & Cross-Tab Sync
    const cleanupRealtime = initRealtimeSync();
    const cleanupCrossTab = initCrossTabSync();

    // Sync Local Auth Event
    const handleAuthUpdate = () => {
      const current = getUserSession();
      if (current && current.code !== 'GUEST-ACCESS') {
        setSession(current);
      } else {
        setSession(null);
      }
    };

    window.addEventListener('satset_auth_updated', handleAuthUpdate);
    window.addEventListener('storage', handleAuthUpdate);

    return () => {
      cleanupRealtime();
      cleanupCrossTab();
      window.removeEventListener('satset_auth_updated', handleAuthUpdate);
      window.removeEventListener('storage', handleAuthUpdate);
    };
  }, []);

  const [publicView, setPublicView] = useState<'login' | 'pricing'>('login');
  const [adminViewMode, setAdminViewMode] = useState<'admin_dashboard' | 'workspace'>('admin_dashboard');

  const handleLogout = () => {
    logoutUser();
    setSession(null);
    setPublicView('login');
  };

  // Proteksi: Jika belum ada session resmi atau terdeteksi guest access, render tampilan publik
  if (!session || session.code === 'GUEST-ACCESS') {
    if (publicView === 'pricing') {
      return (
        <div className="min-h-screen bg-[#fcf8ff] p-4 sm:p-8">
          <PaketAksesView
            onBackToLogin={() => setPublicView('login')}
            onSuccessLogin={() => {
              const current = getUserSession();
              if (current && current.code !== 'GUEST-ACCESS') {
                setSession(current);
                setPublicView('login');
              }
            }}
          />
        </div>
      );
    }

    return (
      <LoginView
        onLoginSuccess={(s) => {
          if (s.code !== 'GUEST-ACCESS') {
            setSession(s);
            setPublicView('login');
          }
        }}
        onOpenPaketAkses={() => {
          setPublicView('pricing');
        }}
      />
    );
  }

  // Tampilan Admin Dashboard
  if (session.role === 'admin' && adminViewMode === 'admin_dashboard') {
    return (
      <AdminDashboardView
        onGoToWorkspace={() => setAdminViewMode('workspace')}
        onLogout={handleLogout}
        onOpenApiKeySettings={() => setAdminViewMode('workspace')}
      />
    );
  }

  // Workspace User Layout (Hanya untuk pengguna terautentikasi resmi)
  return (
    <UserLayout
      session={session}
      onLogout={handleLogout}
      onGoToAdmin={session.role === 'admin' ? () => setAdminViewMode('admin_dashboard') : undefined}
    />
  );
}
