import { NextRequest } from 'next/server';
import { authorizeFinance } from '@/lib/finance/core/auth';
import { companionResponse, CompanionError, readCompanionJson } from '@/lib/companion/core/http';
import { approvePairing } from '@/lib/companion/core/repository';
import { COMPANION_CODE, matches } from '@/lib/companion/core/validation';

export async function POST(request: NextRequest) {
    const session = await authorizeFinance(request, { requireJson: true });
    if ('response' in session) return session.response;
    return companionResponse(async () => {
        const body = await readCompanionJson(request);
        if (!matches(body.code, COMPANION_CODE)) throw new CompanionError('Invalid pairing code');
        await approvePairing(session.user.id, body.code);
        return { approved: true };
    });
}
