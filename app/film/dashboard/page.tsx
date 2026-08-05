'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Aperture,
    CircleDollarSign,
    Film,
    Heart,
} from 'lucide-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Line,
    LineChart,
    Pie,
    PieChart,
    RadialBar,
    RadialBarChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { AppShell } from '@/components/organisms/AppShell';
import { getFilmDashboard } from '@/lib/film/client';
import { Card } from '@/components/atoms/Card';
import { FilmDashboardSummary, FilmRollStatus, filmRollStatusConfig } from '@/lib/types';
import { formatCurrencyMYR } from '@/lib/utils';

const chartColors = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
];

const pipelineStatuses: FilmRollStatus[] = ['UNUSED', 'SHOOTING', 'PROCESSING', 'PROCESSED'];

const pipelineLabels: Partial<Record<FilmRollStatus, string>> = {
    UNUSED: 'Unused',
    SHOOTING: 'Shooting',
    PROCESSING: 'Processing',
    PROCESSED: 'Processed',
};

function EmptyChart({ label = 'No data yet' }: { label?: string }) {
    return (
        <div className="grid min-h-[180px] place-items-center rounded-lg border border-dashed border-border-default bg-bg-hover/40 text-sm text-text-muted">
            {label}
        </div>
    );
}

function MetricCard({
    label,
    value,
    icon: Icon,
}: {
    label: string;
    value: number | string;
    icon: typeof Aperture;
}) {
    return (
        <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-text-muted">{label}</p>
                <Icon size={18} className="shrink-0 text-accent-apricot" />
            </div>
            <p className="mt-3 text-2xl font-extrabold text-text-primary">{value}</p>
        </Card>
    );
}

function ChartCard({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <Card className="p-5">
            <div className="mb-4">
                <h2 className="text-lg font-bold">{title}</h2>
            </div>
            {children}
        </Card>
    );
}

function TrendChart({ summary }: { summary: FilmDashboardSummary }) {
    const hasTrendData = summary.activity_trend.some(
        (entry) => entry.roll_count > 0 || entry.frames_taken > 0 || entry.spend > 0
    );

    if (!hasTrendData) return <EmptyChart label="No trend data." />;

    return (
        <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={summary.activity_trend} margin={{ left: -18, right: 10, top: 10, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="frames" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="spend" orientation="right" hide />
                    <Tooltip
                        formatter={(value: unknown, name: unknown) => {
                            if (name === 'spend') return [formatCurrencyMYR(Number(value ?? 0)), 'Spend'];
                            if (name === 'frames_taken') return [Number(value ?? 0).toLocaleString(), 'Frames'];
                            return [Number(value ?? 0).toLocaleString(), 'Rolls'];
                        }}
                        contentStyle={{
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-default)',
                            borderRadius: '12px',
                            color: 'var(--text-primary)',
                        }}
                    />
                    <Line yAxisId="frames" type="monotone" dataKey="frames_taken" name="frames_taken" stroke="var(--chart-1)" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line yAxisId="spend" type="monotone" dataKey="spend" name="spend" stroke="var(--chart-2)" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line yAxisId="frames" type="monotone" dataKey="roll_count" name="roll_count" stroke="var(--chart-5)" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

function KeeperGauge({ summary }: { summary: FilmDashboardSummary }) {
    const keeperRate = summary.total_pictures_taken
        ? Math.round((summary.successful_photos / summary.total_pictures_taken) * 100)
        : 0;
    const data = [{ name: 'Keeper rate', value: keeperRate, fill: 'var(--chart-4)' }];

    return (
        <Card className="bg-pastel-olive-soft p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold">Keeper rate</h2>
                </div>
                <Aperture size={20} className="text-text-primary" />
            </div>
            <div className="relative mt-4 h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart innerRadius="72%" outerRadius="96%" data={data} startAngle={180} endAngle={-180}>
                        <RadialBar dataKey="value" cornerRadius={12} background={{ fill: 'var(--bg-elevated)' }} />
                    </RadialBarChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div>
                        <p className="text-4xl font-extrabold text-text-primary">{keeperRate}%</p>
                        <p className="text-xs font-semibold uppercase text-text-muted">keeper rate</p>
                    </div>
                </div>
            </div>
        </Card>
    );
}

function PipelineCard({ summary }: { summary: FilmDashboardSummary }) {
    const pipeline = pipelineStatuses.map((status) => ({
        status,
        label: pipelineLabels[status] ?? filmRollStatusConfig[status].label,
        count: summary.status_breakdown.find((entry) => entry.status === status)?.count ?? 0,
    }));
    const total = Math.max(summary.total_rolls, 1);

    return (
        <Card className="bg-pastel-blue-soft p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold">Roll pipeline</h2>
                </div>
                <Film size={20} className="text-text-primary" />
            </div>
            <div className="mt-6 flex h-6 overflow-hidden rounded-full border border-border-dark bg-bg-elevated">
                {pipeline.map((item, index) => (
                    <span
                        key={item.status}
                        className="h-full border-r border-border-dark last:border-r-0"
                        style={{
                            width: `${summary.total_rolls ? (item.count / total) * 100 : 100 / pipeline.length}%`,
                            background: chartColors[index % chartColors.length],
                        }}
                    />
                ))}
            </div>
            <div className="mt-5 space-y-3">
                {pipeline.map((item, index) => (
                    <div key={`legend-${item.status}`} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2 text-text-secondary">
                            <span
                                className="size-3 rounded-full border border-border-dark"
                                style={{ background: chartColors[index % chartColors.length] }}
                            />
                            {item.label}
                        </span>
                        <span className="font-bold text-text-primary">{item.count}</span>
                    </div>
                ))}
            </div>
        </Card>
    );
}

function CostBreakdownChart({ summary }: { summary: FilmDashboardSummary }) {
    const data = summary.cost_breakdown.filter((entry) => entry.amount > 0);
    if (!data.length) return <EmptyChart label="No cost data." />;

    return (
        <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ left: -20, right: 4, top: 8, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(value: unknown) => formatCurrencyMYR(Number(value ?? 0))} />
                    <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                        {data.map((entry, index) => (
                            <Cell key={entry.key} fill={chartColors[index % chartColors.length]} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

function FormatChart({ summary }: { summary: FilmDashboardSummary }) {
    const data = summary.format_breakdown.filter((entry) => entry.count > 0);
    if (!data.length) return <EmptyChart label="No format mix yet." />;

    return (
        <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
            <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={data} dataKey="count" nameKey="label" innerRadius={48} outerRadius={72} paddingAngle={3}>
                            {data.map((entry, index) => (
                                <Cell key={entry.format} fill={chartColors[index % chartColors.length]} />
                            ))}
                        </Pie>
                        <Tooltip />
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <div className="space-y-3 self-center">
                {data.map((entry, index) => (
                    <div key={entry.format} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2 text-text-secondary">
                            <span className="size-3 rounded-full border border-border-dark" style={{ background: chartColors[index % chartColors.length] }} />
                            {entry.label}
                        </span>
                        <span className="font-bold text-text-primary">{entry.count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function CameraUsageChart({ summary }: { summary: FilmDashboardSummary }) {
    const data = summary.camera_usage.filter((entry) => entry.roll_count > 0);
    if (!data.length) return <EmptyChart label="No camera usage." />;

    return (
        <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} layout="vertical" margin={{ left: 6, right: 12, top: 8, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="4 4" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="label" width={112} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(value: unknown) => [`${Number(value ?? 0)} rolls`, 'Rolls']} />
                    <Bar dataKey="roll_count" radius={[0, 8, 8, 0]} fill="var(--chart-1)" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

export default function FilmDashboardPage() {
    const [summary, setSummary] = useState<FilmDashboardSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getFilmDashboard()
            .then(setSummary)
            .catch((loadError) => setError(loadError.message || 'Failed to load dashboard'));
    }, []);

    const metrics = useMemo(() => summary ? [
        { label: 'Pictures taken', value: summary.total_pictures_taken.toLocaleString(), icon: Aperture },
        { label: 'Total spending', value: formatCurrencyMYR(summary.total_money_spent), icon: CircleDollarSign },
        { label: 'Rolls tracked', value: summary.total_rolls.toLocaleString(), icon: Film },
        { label: 'Favorite photos', value: summary.favorite_photos.toLocaleString(), icon: Heart },
    ] : [], [summary]);

    if (!summary && !error) {
        return (
            <AppShell isLoading loadingMessage="Developing dashboard totals..." contentClassName="film-module p-5 md:p-8">
                <div />
            </AppShell>
        );
    }

    return (
        <AppShell pageTitle="Film Dashboard" contentClassName="film-module p-5 md:p-8">
            <div className="mx-auto max-w-7xl space-y-7">
                {error ? (
                    <div className="rounded-lg border border-error bg-error-bg p-4 text-error">{error}</div>
                ) : summary && (
                    <>
                        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            {metrics.map(({ label, value, icon }) => (
                                <MetricCard key={label} label={label} value={value} icon={icon} />
                            ))}
                        </section>

                        {summary.total_rolls === 0 && (
                            <Card className="border-dashed p-8 text-center">
                                <Film className="mx-auto mb-3 text-text-muted" size={34} />
                                <h2 className="text-lg font-bold">No rolls tracked yet</h2>
                            </Card>
                        )}

                        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
                            <ChartCard title="Monthly exposure">
                                <TrendChart summary={summary} />
                            </ChartCard>
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                                <KeeperGauge summary={summary} />
                                <PipelineCard summary={summary} />
                            </div>
                        </section>

                        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                            <ChartCard title="Cost breakdown">
                                <CostBreakdownChart summary={summary} />
                            </ChartCard>
                            <ChartCard title="Format mix">
                                <FormatChart summary={summary} />
                            </ChartCard>
                            <ChartCard title="Camera usage">
                                <CameraUsageChart summary={summary} />
                            </ChartCard>
                        </section>

                    </>
                )}
            </div>
        </AppShell>
    );
}
