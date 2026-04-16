import { NextRequest, NextResponse } from 'next/server';
import { resolveIdentity, AuthError } from '@/lib/auth/resolveIdentity';
import { listAccessibleLogs } from '@/lib/logs/access';
import { DailyLogEntry } from '@/lib/types';

interface ExportRequest {
    from: string;
    to: string;
}

// POST /api/export/weekly - Generate markdown table
export async function POST(request: NextRequest) {
    try {
        const identity = await resolveIdentity(request);

        // Only admin can export
        if (identity.role !== 'admin') {
            return NextResponse.json({
                error: 'Forbidden',
                message: 'Only admin can export weekly logs'
            }, { status: 403 });
        }

        const body: ExportRequest = await request.json();

        if (!body.from || !body.to) {
            return NextResponse.json({
                error: 'Validation error',
                message: 'from and to dates are required'
            }, { status: 400 });
        }

        const { data } = await listAccessibleLogs(identity, {
            from: body.from,
            sort: 'effective_date.asc',
            to: body.to,
        });
        const markdown = generateMarkdownTable(data);

        return NextResponse.json({ markdown });
    } catch (err) {
        if (err instanceof AuthError) {
            return NextResponse.json({ error: 'Unauthorized', message: err.message }, { status: err.statusCode });
        }
        return NextResponse.json({ error: 'Internal error', message: 'An unexpected error occurred' }, { status: 500 });
    }
}

function generateMarkdownTable(logs: DailyLogEntry[]): string {
    if (logs.length === 0) {
        return 'No logs found for the specified date range.';
    }

    const header = '| Date / Day | Operation / Task | Equipment / Development Tools Used | Lesson Learned |';
    const separator = '|------------|------------------|-------------------------------------|----------------|';

    const rows = logs.map(log => {
        const content = log.content || ({ date: log.effective_date } as DailyLogEntry['content']);
        const dateDay = content.day ? `${content.date} / ${content.day}` : content.date;
        const task = content.operation_task || '';
        const tools = content.tools_used || '';
        const lesson = content.lesson_learned || '';

        // Escape pipe characters in content
        const escape = (str: string) => str.replace(/\|/g, '\\|').replace(/\n/g, ' ');

        return `| ${escape(dateDay)} | ${escape(task)} | ${escape(tools)} | ${escape(lesson)} |`;
    });

    return [header, separator, ...rows].join('\n');
}
