'use client';

import { AppShell } from '@/components/organisms/AppShell';
import { LogViewer } from '@/app/log-viewer/_components';

export default function LogViewerPage() {
  return (
    <AppShell contentClassName="p-5 md:p-8" pageTitle="Log Viewer">
      <div className="w-full min-w-0 max-w-6xl space-y-8">
        <LogViewer />
      </div>
    </AppShell>
  );
}

