'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/organisms/Sidebar';
import { Card } from '@/components/atoms/Card';
import { PageLoader } from '@/components/atoms/Loader';
import { Project } from '@/lib/types';
import { LogViewer } from '@/components/organisms/LogViewer';

export default function LogViewerPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProjects() {
      try {
        setIsLoading(true);
        const res = await fetch('/api/projects');
        if (!res.ok) throw new Error('Failed to fetch projects');
        const data = await res.json();
        setProjects(data.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    }
    fetchProjects();
  }, []);

  if (isLoading) return <PageLoader />;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <Card className="p-6 max-w-md">
          <h2 className="text-lg font-heading mb-2 text-text-primary">Error</h2>
          <p className="text-text-muted">{error}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-bg-base">
      <Sidebar projects={projects} />
      <main className="flex-1 ml-64 p-8">
        <LogViewer />
      </main>
    </div>
  );
}

