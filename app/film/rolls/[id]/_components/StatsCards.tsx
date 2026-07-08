'use client';

import { Card } from '@/components/atoms/Card';
import { FilmRoll } from '@/lib/types';
import { formatCurrencyMYR } from '@/lib/utils';

interface StatsCardsProps {
    roll: FilmRoll;
}

export function StatsCards({ roll }: StatsCardsProps) {
    const totalCost = Number(roll.purchase_price || 0)
        + Number(roll.processing_cost || 0)
        + Number(roll.scanning_cost || 0)
        + Number(roll.shipping_cost || 0);
    const costPerFrame = roll.frames_taken ? totalCost / roll.frames_taken : 0;
    const costPerSuccessfulPhoto = roll.successful_photos ? totalCost / roll.successful_photos : 0;

    return (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="p-5">
                <p className="text-sm text-text-muted">Total Cost</p>
                <p className="mt-2 text-2xl font-extrabold">{formatCurrencyMYR(totalCost)}</p>
            </Card>
            <Card className="p-5">
                <p className="text-sm text-text-muted">Frames</p>
                <p className="mt-2 text-2xl font-extrabold">{roll.frames_taken}</p>
            </Card>
            <Card className="p-5">
                <p className="text-sm text-text-muted">Cost / Frame</p>
                <p className="mt-2 text-2xl font-extrabold">{formatCurrencyMYR(costPerFrame)}</p>
            </Card>
            <Card className="p-5">
                <p className="text-sm text-text-muted">Cost / Successful Photo</p>
                <p className="mt-2 text-2xl font-extrabold">{formatCurrencyMYR(costPerSuccessfulPhoto)}</p>
            </Card>
        </section>
    );
}
