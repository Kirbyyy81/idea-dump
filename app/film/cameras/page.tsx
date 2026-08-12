'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Camera, Plus, Save, Trash2, Wrench } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Textarea } from '@/components/atoms/Textarea';
import { FilmCamera, FilmMaintenanceRecord } from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';
import {
    createFilmCamera,
    createFilmMaintenance,
    deleteFilmCamera,
    deleteFilmMaintenance,
    listFilmCameras,
    listFilmMaintenance,
    updateFilmCamera,
} from '@/lib/film/core/client';
import { cn, formatCurrencyMYR } from '@/lib/utils';

const blankCamera = {
    name: '',
    brand: '',
    model: '',
    purchase_date: '',
    notes: '',
};

const blankMaintenance = {
    service_type: 'CLA',
    provider_name: '',
    maintenance_cost: '',
    service_date: '',
    notes: '',
};

function cameraForm(camera: FilmCamera) {
    return {
        name: camera.name,
        brand: camera.brand || '',
        model: camera.model || '',
        purchase_date: camera.purchase_date || '',
        notes: camera.notes || '',
    };
}

export default function FilmCamerasPage() {
    const { showSuccess } = useAlert();
    const [cameras, setCameras] = useState<FilmCamera[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [form, setForm] = useState(blankCamera);
    const [maintenance, setMaintenance] = useState<FilmMaintenanceRecord[]>([]);
    const [maintenanceForm, setMaintenanceForm] = useState(blankMaintenance);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const selected = cameras.find((camera) => camera.id === selectedId) || null;

    const loadCameras = useCallback(async (preferredId?: string) => {
        const next = await listFilmCameras();
        setCameras(next);

        const nextId = preferredId || selectedId || next[0]?.id || '';
        setSelectedId(next.some((camera: FilmCamera) => camera.id === nextId) ? nextId : next[0]?.id || '');
    }, [selectedId]);

    useEffect(() => {
        loadCameras()
            .catch((loadError) => setError(loadError.message))
            .finally(() => setIsLoading(false));
    }, [loadCameras]);

    useEffect(() => {
        if (selected) setForm(cameraForm(selected));
        else setForm(blankCamera);
    }, [selected]);

    useEffect(() => {
        if (!selectedId) {
            setMaintenance([]);
            return;
        }

        listFilmMaintenance(selectedId)
            .then(setMaintenance)
            .catch((loadError) => setError(loadError.message || 'Failed to load maintenance'));
    }, [selectedId]);

    async function saveCamera(event: FormEvent) {
        event.preventDefault();
        setIsSaving(true);
        setError(null);

        try {
            const camera = selected
                ? await updateFilmCamera({ id: selected.id, ...form })
                : await createFilmCamera(form);
            await loadCameras(camera.id);
            showSuccess(selected ? 'Camera saved.' : 'Camera added.', 'Saved');
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Failed to save camera');
        } finally {
            setIsSaving(false);
        }
    }

    async function deleteCamera() {
        if (!selected || !window.confirm(`Delete ${selected.name}? Its maintenance history will also be deleted.`)) return;

        try {
            await deleteFilmCamera(selected.id);
            setSelectedId('');
            await loadCameras();
            showSuccess('Camera deleted.', 'Deleted');
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete camera');
        }
    }

    async function addMaintenance(event: FormEvent) {
        event.preventDefault();
        if (!selected) return;

        setIsSaving(true);
        setError(null);

        try {
            const record = await createFilmMaintenance({
                camera_id: selected.id,
                ...maintenanceForm,
                maintenance_cost: Number(maintenanceForm.maintenance_cost || 0),
            });

            setMaintenance((records) => [record, ...records]);
            setMaintenanceForm(blankMaintenance);
            showSuccess('Maintenance record added.', 'Saved');
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Failed to add maintenance');
        } finally {
            setIsSaving(false);
        }
    }

    async function deleteMaintenance(id: string) {
        try {
            await deleteFilmMaintenance(id);
            setMaintenance((records) => records.filter((record) => record.id !== id));
            showSuccess('Maintenance record deleted.', 'Deleted');
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete maintenance record');
        }
    }

    if (isLoading) {
        return (
            <AppShell isLoading loadingMessage="Opening camera cabinet..." contentClassName="film-module p-5 md:p-8">
                <div />
            </AppShell>
        );
    }

    return (
        <AppShell pageTitle="Cameras & Maintenance" contentClassName="film-module p-5 md:p-8">
            <div className="mx-auto max-w-7xl space-y-7">
                {error && (
                    <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-sm text-error">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <Card className="h-fit p-3">
                        <Button className="mb-3 w-full" icon={<Plus size={16} />} onClick={() => setSelectedId('')}>
                            Add Camera
                        </Button>
                        <div className="space-y-2">
                            {cameras.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setSelectedId(item.id)}
                                    className={cn(
                                        'w-full rounded-lg border p-3 text-left transition-colors',
                                        selectedId === item.id
                                            ? 'border-accent-blue bg-accent-blue/10'
                                            : 'border-border-default hover:bg-bg-hover',
                                    )}
                                >
                                    <p className="font-bold text-text-primary">{item.name}</p>
                                    {[item.brand, item.model].filter(Boolean).length > 0 && (
                                        <p className="text-sm text-text-muted">
                                            {[item.brand, item.model].filter(Boolean).join(' ')}
                                        </p>
                                    )}
                                </button>
                            ))}
                            {!cameras.length && (
                                <p className="p-4 text-center text-sm text-text-muted">No cameras yet.</p>
                            )}
                        </div>
                    </Card>

                    <div className="space-y-6">
                        <form onSubmit={saveCamera}>
                            <Card className="p-5">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <Camera size={19} className="text-accent-blue" />
                                        <h2 className="text-lg font-bold">{selected ? 'Camera details' : 'New camera'}</h2>
                                    </div>
                                    {selected && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            icon={<Trash2 size={15} />}
                                            onClick={deleteCamera}
                                        >
                                            Delete
                                        </Button>
                                    )}
                                </div>

                                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <label className="space-y-2">
                                        <span className="text-sm text-text-secondary">Camera name</span>
                                        <Input
                                            required
                                            value={form.name}
                                            onChange={(event) => setForm({ ...form, name: event.target.value })}
                                        />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-sm text-text-secondary">Brand</span>
                                        <Input
                                            value={form.brand}
                                            onChange={(event) => setForm({ ...form, brand: event.target.value })}
                                        />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-sm text-text-secondary">Model</span>
                                        <Input
                                            value={form.model}
                                            onChange={(event) => setForm({ ...form, model: event.target.value })}
                                        />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-sm text-text-secondary">Purchase date</span>
                                        <Input
                                            type="date"
                                            value={form.purchase_date}
                                            onChange={(event) => setForm({ ...form, purchase_date: event.target.value })}
                                        />
                                    </label>
                                    <label className="space-y-2 md:col-span-2">
                                        <span className="text-sm text-text-secondary">Camera notes</span>
                                        <Textarea
                                            value={form.notes}
                                            onChange={(event) => setForm({ ...form, notes: event.target.value })}
                                        />
                                    </label>
                                </div>

                                <div className="mt-4 flex justify-end">
                                    <Button type="submit" icon={<Save size={15} />} isLoading={isSaving}>
                                        {selected ? 'Save Camera' : 'Add Camera'}
                                    </Button>
                                </div>
                            </Card>
                        </form>

                        {selected && (
                            <Card className="p-5">
                                <div className="flex items-center gap-2">
                                    <Wrench size={19} className="text-accent-apricot" />
                                    <h2 className="text-lg font-bold">Maintenance history</h2>
                                </div>

                                <div className="mt-4 space-y-3">
                                    {maintenance.map((record) => (
                                        <div
                                            key={record.id}
                                            className="flex items-start justify-between gap-4 rounded-lg border border-border-default bg-bg-hover/40 p-4"
                                        >
                                            <div>
                                                <p className="font-bold text-text-primary">
                                                    {record.service_type || 'Maintenance'}
                                                </p>
                                                {[record.service_date, record.provider_name].filter(Boolean).length > 0 && (
                                                    <p className="text-sm text-text-muted">
                                                        {[record.service_date, record.provider_name].filter(Boolean).join(' - ')}
                                                    </p>
                                                )}
                                                {record.notes && (
                                                    <p className="mt-2 text-sm text-text-secondary">{record.notes}</p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-bold">
                                                    {formatCurrencyMYR(Number(record.maintenance_cost))}
                                                </span>
                                                <button
                                                    type="button"
                                                    aria-label="Delete maintenance record"
                                                    onClick={() => deleteMaintenance(record.id)}
                                                    className="text-text-muted hover:text-error"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {!maintenance.length && (
                                        <div className="rounded-lg border border-dashed border-border-default p-5 text-center text-sm text-text-muted">
                                            No maintenance recorded.
                                        </div>
                                    )}
                                </div>

                                <form
                                    onSubmit={addMaintenance}
                                    className="mt-5 grid grid-cols-1 gap-3 border-t border-border-default pt-5 md:grid-cols-2"
                                >
                                    <label className="space-y-2">
                                        <span className="text-sm text-text-secondary">Service type</span>
                                        <Select
                                            value={maintenanceForm.service_type}
                                            onChange={(nextValue) => setMaintenanceForm({
                                                ...maintenanceForm,
                                                service_type: nextValue,
                                            })}
                                            options={[
                                                { value: 'CLA', label: 'CLA' },
                                                { value: 'Lens Cleaning', label: 'Lens Cleaning' },
                                                { value: 'Light Seal Replacement', label: 'Light Seal Replacement' },
                                                { value: 'Repair', label: 'Repair' },
                                                { value: 'Battery Replacement', label: 'Battery Replacement' },
                                                { value: 'Custom Maintenance', label: 'Custom Maintenance' },
                                            ]}
                                        />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-sm text-text-secondary">Provider</span>
                                        <Input
                                            value={maintenanceForm.provider_name}
                                            onChange={(event) => setMaintenanceForm({
                                                ...maintenanceForm,
                                                provider_name: event.target.value,
                                            })}
                                        />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-sm text-text-secondary">Cost</span>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={maintenanceForm.maintenance_cost}
                                            onChange={(event) => setMaintenanceForm({
                                                ...maintenanceForm,
                                                maintenance_cost: event.target.value,
                                            })}
                                        />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-sm text-text-secondary">Service date</span>
                                        <Input
                                            type="date"
                                            value={maintenanceForm.service_date}
                                            onChange={(event) => setMaintenanceForm({
                                                ...maintenanceForm,
                                                service_date: event.target.value,
                                            })}
                                        />
                                    </label>
                                    <label className="space-y-2 md:col-span-2">
                                        <span className="text-sm text-text-secondary">Service notes</span>
                                        <Textarea
                                            value={maintenanceForm.notes}
                                            onChange={(event) => setMaintenanceForm({
                                                ...maintenanceForm,
                                                notes: event.target.value,
                                            })}
                                        />
                                    </label>
                                    <div className="md:col-span-2">
                                        <Button type="submit" isLoading={isSaving}>
                                            Add Maintenance
                                        </Button>
                                    </div>
                                </form>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
