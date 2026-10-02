'use client';

import { AppShell } from '@/components/organisms/AppShell';
import { BarcodeGenerator } from './_components/BarcodeGenerator';

export default function BarcodeGeneratorPage() {
    return (
        <AppShell pageTitle="Barcode Generator">
            <BarcodeGenerator />
        </AppShell>
    );
}
