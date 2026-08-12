'use client';

import { FinanceShareClientMessage } from '@/lib/finance/share/protocol';

async function getFinanceShareWorker() {
    if (!('serviceWorker' in navigator)) return null;
    if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller;
    return (await navigator.serviceWorker.ready).active;
}

export async function postFinanceShareWorkerMessage(message: FinanceShareClientMessage) {
    const worker = await getFinanceShareWorker();
    worker?.postMessage(message);
}
