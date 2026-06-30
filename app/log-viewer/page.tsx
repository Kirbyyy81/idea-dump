'use client';

import { AppShell } from '@/components/organisms/AppShell';
import { LogViewer } from '@/components/organisms/LogViewer';

export default function LogViewerPage() {
  return (
    <AppShell contentClassName="p-8">
      <div className="w-full min-w-0 max-w-6xl space-y-8">
        <header>
          <h1 className="text-2xl font-extrabold">Log Viewer</h1>
        </header>

        <LogViewer />
      </div>
    </AppShell>
  );
}

