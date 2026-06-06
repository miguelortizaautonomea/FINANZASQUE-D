'use client';

import { useState } from 'react';
import Dashboard from '@/components/dashboard';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <Dashboard />
      {/* Force redeploy */}
    </div>
  );
}
