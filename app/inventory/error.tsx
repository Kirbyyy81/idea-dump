'use client';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { InventoryErrorNotice } from './_components/fields';
export default function InventoryError({ reset }: { reset: () => void }) {
    return <AppShell pageTitle="Inventory"><InventoryErrorNotice error="Inventory could not be loaded. Please try again." /><Button onClick={reset}>Try again</Button></AppShell>;
}
