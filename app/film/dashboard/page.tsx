'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import {
    Aperture,
    Camera,
    CircleDollarSign,
    Film,
    Heart,
    Image as ImageIcon,
    Wrench,
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
import { Card } from '@/components/atoms/Card';
import { FilmDashboardSummary, FilmRoll, FilmRollStatus, filmRollStatusConfig } from '@/lib/types';
import { cn, formatCurrencyMYR } from '@/lib/utils';

const chartColors = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
];

const pipelineStatuses: FilmRollStatus[] = ['UNUSED', 'LOADED', 'SHOOTING', 'PROCESSED', 'ARCHIVED'];

const pipelineLabels: Partial<Record<FilmRollStatus, string>> = {
    UNUSED: 'Unused',
    LOADED: 'Loaded',
    SHOOTING: 'Shooting',
    PROCESSED: 'Processed',
    ARCHIVED: 'Archived',
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
    subtitle,
    children,
}: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    return (
        <Card className="p-5">
            <div className="mb-4">
                <h2 className="text-lg font-bold">{title}</h2>
                {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
            </div>
            {children}
        </Card>
    );
}

function TrendChart({ summary }: { summary: FilmDashboardSummary }) {
    const hasTrendData = summary.activity_trend.some(
        (entry) => entry.roll_count > 0 || entry.frames_taken > 0 || entry.spend > 0
    );

    if (!hasTrendData) return <EmptyChart label="Create rolls to build a monthly trend." />;

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
                    <p className="mt-1 text-sm text-text-muted">Successful photos from tracked frames.</p>
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
            <p className="text-sm text-text-secondary">
                {summary.successful_photos.toLocaleString()} successful from {summary.total_pictures_taken.toLocaleString()} frames.
            </p>
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
                    <p className="mt-1 text-sm text-text-muted">Where your rolls are right now.</p>
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
    if (!data.length) return <EmptyChart label="Add roll and processing costs to see spending." />;

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
    if (!data.length) return <EmptyChart label="Assign rolls to cameras to see usage." />;

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

function RecentRollTile({ roll }: { roll: FilmRoll }) {
    const cover = roll.cover_image_url || roll.cover_photo?.thumbnail_link;

    return (
        <article className="min-w-[178px] overflow-hidden rounded-lg border border-border-default bg-bg-elevated">
            <div className="relative aspect-[4/3] bg-bg-hover">
                {cover ? (
                    <img src={cover} alt={`${roll.film_name} cover`} className="h-full w-full object-cover" />
                ) : (
                    <div className="grid h-full place-items-center text-text-muted">
                        <Film size={28} />
                    </div>
                )}
                <span className={cn('absolute left-2 top-2 rounded-full border px-2 py-1 text-[10px] font-bold', filmRollStatusConfig[roll.status].colorClass)}>
                    {filmRollStatusConfig[roll.status].label}
                </span>
            </div>
            <div className="space-y-2 p-3">
                <p className="truncate text-sm font-bold text-text-primary">{roll.brand} {roll.film_name}</p>
                <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
                    <span>{roll.frames_taken || 0} frames</span>
                    <span>{formatCurrencyMYR(Number(roll.purchase_price || 0))}</span>
                </div>
            </div>
        </article>
    );
}

export default function FilmDashboardPage() {
    const [summary, setSummary] = useState<FilmDashboardSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/film/dashboard')
            .then(async (response) => {
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error);
                setSummary(payload.data);
            })
            .catch((loadError) => setError(loadError.message || 'Failed to load dashboard'));
    }, []);

    const metrics = useMemo(() => summary ? [
        { label: 'Pictures taken', value: summary.total_pictures_taken.toLocaleString(), icon: Aperture },
        { label: 'Total spending', value: formatCurrencyMYR(summary.total_money_spent), icon: CircleDollarSign },
        { label: 'Cameras owned', value: summary.total_cameras.toLocaleString(), icon: Camera },
        { label: 'Rolls tracked', value: summary.total_rolls.toLocaleString(), icon: Film },
        { label: 'Successful photos', value: summary.successful_photos.toLocaleString(), icon: ImageIcon },
        { label: 'Favorite photos', value: summary.favorite_photos.toLocaleString(), icon: Heart },
        { label: 'Maintenance cost', value: formatCurrencyMYR(summary.maintenance_cost), icon: Wrench },
        { label: 'Average cost / photo', value: formatCurrencyMYR(summary.average_cost_per_photo), icon: CircleDollarSign },
    ] : [], [summary]);

    if (!summary && !error) {
        return (
            <AppShell isLoading loadingMessage="Developing dashboard totals..." contentClassName="p-5 md:p-8">
                <div />
            </AppShell>
        );
    }

    return (
        <AppShell contentClassName="p-5 md:p-8">
            <div className="mx-auto max-w-7xl space-y-7">
                <header className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="text-sm uppercase tracking-wide text-text-muted">At a glance</p>
                        <h1 className="mt-1">Film Dashboard</h1>
                        {summary && (
                            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
                                {summary.total_rolls.toLocaleString()} rolls, {summary.total_pictures_taken.toLocaleString()} frames,
                                and {formatCurrencyMYR(summary.total_money_spent)} tracked across your film cupboard.
                            </p>
                        )}
                    </div>
                </header>

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
                                <p className="mt-2 text-sm text-text-muted">
                                    Register your first roll to unlock spending, keeper rate, camera usage, and activity charts.
                                </p>
                            </Card>
                        )}

                        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
                            <ChartCard title="Monthly exposure" subtitle="Frames, spend, and roll starts over the last six months.">
                                <TrendChart summary={summary} />
                            </ChartCard>
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                                <KeeperGauge summary={summary} />
                                <PipelineCard summary={summary} />
                            </div>
                        </section>

                        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                            <ChartCard title="Cost breakdown" subtitle="Where the money goes.">
                                <CostBreakdownChart summary={summary} />
                            </ChartCard>
                            <ChartCard title="Format mix" subtitle="Roll formats in your cupboard.">
                                <FormatChart summary={summary} />
                            </ChartCard>
                            <ChartCard title="Camera usage" subtitle="Top cameras by assigned rolls.">
                                <CameraUsageChart summary={summary} />
                            </ChartCard>
                        </section>

                        <ChartCard title="Recent rolls" subtitle="The latest rolls added to your shelf.">
                            {summary.recent_rolls.length ? (
                                <div className="scrollbar-hidden flex gap-3 overflow-x-auto pb-1">
                                    {summary.recent_rolls.map((roll) => (
                                        <RecentRollTile key={roll.id} roll={roll} />
                                    ))}
                                </div>
                            ) : (
                                <EmptyChart label="Recent rolls will appear here." />
                            )}
                        </ChartCard>
                    </>
                )}
            </div>
        </AppShell>
    );
}
