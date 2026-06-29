'use client';

import { useEffect, useState } from 'react';
import { Aperture, Camera, CircleDollarSign, Film, Heart, Image as ImageIcon, Wrench } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Card } from '@/components/atoms/Card';
import { FilmDashboardSummary } from '@/lib/types';

function money(value: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0); }

export default function FilmDashboardPage() {
    const [summary, setSummary] = useState<FilmDashboardSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { fetch('/api/film/dashboard').then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setSummary(payload.data); }).catch((loadError) => setError(loadError.message || 'Failed to load dashboard')); }, []);
    if (!summary && !error) {
        return <AppShell isLoading loadingMessage="Developing dashboard totals..." contentClassName="p-5 md:p-8"><div /></AppShell>;
    }
    const metrics = summary ? [
        { label: 'Pictures taken', value: summary.total_pictures_taken, icon: Aperture },
        { label: 'Total spending', value: money(summary.total_money_spent), icon: CircleDollarSign },
        { label: 'Cameras owned', value: summary.total_cameras, icon: Camera },
        { label: 'Rolls tracked', value: summary.total_rolls, icon: Film },
        { label: 'Successful photos', value: summary.successful_photos, icon: ImageIcon },
        { label: 'Favorite photos', value: summary.favorite_photos, icon: Heart },
        { label: 'Maintenance cost', value: money(summary.maintenance_cost), icon: Wrench },
        { label: 'Average cost / photo', value: money(summary.average_cost_per_photo), icon: CircleDollarSign },
    ] : [];
    return <AppShell contentClassName="p-5 md:p-8"><div className="mx-auto max-w-7xl space-y-7"><header className="space-y-5"><div><p className="text-sm uppercase tracking-[0.22em] text-text-muted">At a glance</p><h1 className="mt-1">Film Dashboard</h1></div></header>{error ? <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-400">{error}</div> : <><section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, icon: Icon }) => <Card key={label} className="p-5"><div className="flex items-center justify-between"><p className="text-sm text-text-muted">{label}</p><Icon size={18} className="text-accent-apricot" /></div><p className="mt-3 text-3xl font-semibold text-text-primary">{value}</p></Card>)}</section><section className="grid grid-cols-1 gap-4 md:grid-cols-3"><Card className="p-5"><p className="text-sm text-text-muted">Unused / in progress</p><p className="mt-2 text-2xl font-semibold">{summary!.unprocessed_rolls}</p></Card><Card className="p-5"><p className="text-sm text-text-muted">Processed / archived</p><p className="mt-2 text-2xl font-semibold">{summary!.processed_rolls}</p></Card><Card className="p-5"><p className="text-sm text-text-muted">Loaded or shooting</p><p className="mt-2 text-2xl font-semibold">{summary!.rolls_loaded_or_shooting}</p></Card></section></>}</div></AppShell>;
}
