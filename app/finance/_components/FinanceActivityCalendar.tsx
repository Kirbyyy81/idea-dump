'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/atoms/Button';
import type { FinanceDashboardSummary } from '@/lib/types';
import { daysInMonth } from '@/shared/date';
import { formatCurrencyMYR } from '@/lib/utils';
import { financeTransactionsHref } from '@/lib/finance/transactions/filters';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const shortAmount = new Intl.NumberFormat('en-MY', { notation: 'compact', maximumFractionDigits: 1 });
const dateLabel = (date: string) => new Intl.DateTimeFormat('en-MY', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${date}T00:00:00Z`));

function cellAmount(value: number) {
    if (value > 0 && value < 0.1) return '<0.1';
    return shortAmount.format(value);
}

export function FinanceActivityCalendar({ month, today, items }: {
    month: string; today: string; items: FinanceDashboardSummary['daily_cash_flow'];
}) {
    const [year, monthNumber] = month.split('-').map(Number);
    const firstDay = `${month}-01`;
    const offset = (new Date(`${firstDay}T00:00:00Z`).getUTCDay() + 6) % 7;
    const dayCount = daysInMonth(year, monthNumber);
    const days = Array.from({ length: dayCount }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
    const daily = new Map(items.filter((item) => item.date.startsWith(`${month}-`)).map((item) => [item.date, item]));
    const latestActivity = days.filter((date) => date <= today && daily.has(date)).at(-1);
    const [selectedDate, setSelectedDate] = useState(today.startsWith(`${month}-`) ? today : latestActivity ?? firstDay);
    const selected = daily.get(selectedDate);
    const selectedFuture = selectedDate > today;
    const income = selected?.income ?? 0;
    const expense = selected?.expense ?? 0;

    return <section aria-labelledby="activity-calendar-heading" className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="activity-calendar-heading" className="text-base font-bold">Daily activity</h2>
            <p className="flex gap-3 text-xs"><span className="text-success">+ Income</span><span className="text-error">− Spent</span><span className="text-text-muted">MYR</span></p>
        </div>
        <div className="mt-3 overflow-x-auto pb-1">
            <div className="min-w-[280px]">
                <div className="grid grid-cols-7 py-2 text-center text-xs text-text-muted" aria-hidden="true">
                    {weekdays.map((day) => <span key={day}>{day}</span>)}
                </div>
                <div className="grid grid-cols-7" role="group" aria-label="Daily activity calendar">
                    {Array.from({ length: offset }, (_, index) => <div key={`offset-${index}`} aria-hidden="true" />)}
                    {days.map((date, index) => {
                        const item = daily.get(date);
                        const future = date > today;
                        const selectedDay = date === selectedDate;
                        return <Button key={date} type="button" variant="ghost" disabled={future}
                            aria-label={`${dateLabel(date)}${future ? ', future date' : `, income ${formatCurrencyMYR(item?.income ?? 0)}, spent ${formatCurrencyMYR(item?.expense ?? 0)}`}`}
                            aria-pressed={selectedDay && !future} aria-current={date === today ? 'date' : undefined}
                            onClick={() => setSelectedDate(date)}
                            className={`min-h-20 min-w-0 flex-col justify-start gap-1 rounded-sm border px-0.5 py-2 text-[10px] tabular-nums sm:text-xs ${selectedDay && !future ? 'border-border-dark bg-bg-selected' : 'border-border-subtle'} disabled:cursor-default disabled:opacity-40`}>
                            <span className={`mb-1 text-xs ${date === today ? 'font-bold underline underline-offset-2' : 'font-medium'}`}>{index + 1}</span>
                            {!future && <span className="flex w-full min-w-0 flex-col gap-1" aria-hidden="true">
                                <span className={`truncate ${item?.income ? 'text-success' : 'font-normal text-text-muted'}`}>+{cellAmount(item?.income ?? 0)}</span>
                                <span className={`truncate ${item?.expense ? 'text-error' : 'font-normal text-text-muted'}`}>−{cellAmount(item?.expense ?? 0)}</span>
                            </span>}
                        </Button>;
                    })}
                </div>
            </div>
        </div>
        <div className="mt-3 rounded-md border border-border-default bg-bg-surface p-3" role="region" aria-label="Selected day" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{dateLabel(selectedDate)}</h3>
                {!selectedFuture && <Link href={financeTransactionsHref({ date: selectedDate })} className="flex min-h-10 items-center text-xs font-semibold underline underline-offset-4">View transactions</Link>}
            </div>
            {selectedFuture ? <p className="mt-2 text-sm text-text-muted">No activity yet.</p> : <>
                <dl className="mt-2 grid grid-cols-2 gap-3 text-xs">
                    <div><dt className="text-text-muted">Income</dt><dd className="mt-1 break-all font-semibold text-success">+{formatCurrencyMYR(income)}</dd></div>
                    <div><dt className="text-text-muted">Spent</dt><dd className="mt-1 break-all font-semibold text-error">−{formatCurrencyMYR(expense)}</dd></div>
                </dl>
                {!income && !expense && <p className="mt-2 text-xs text-text-muted">No transactions this day.</p>}
            </>}
        </div>
    </section>;
}
