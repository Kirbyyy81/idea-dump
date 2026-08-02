'use client';

import { AppShell } from '@/components/organisms/AppShell';
import { PageHeader } from '@/components/molecules/PageHeader';
import { LogViewer } from '@/app/log-viewer/_components';

export default function LogViewerPage() {
  return (
    <AppShell contentClassName="p-5 md:p-8">
      <div className="w-full min-w-0 max-w-6xl space-y-8">
        <PageHeader title="Log Viewer" />

        <LogViewer />
      </div>
    </AppShell>
  );
}

