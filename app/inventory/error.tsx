'use client';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
export default function InventoryError({ reset }: { reset: () => void }) {
    return <AppShell pageTitle="Inventory"><div className="space-y-4 rounded-lg border border-border-default p-5"><p role="alert">Your shelf could not be loaded. Please try again.</p><Button onClick={reset}>Try again</Button></div></AppShell>;
}
