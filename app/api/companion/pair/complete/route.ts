import { companionResponse, CompanionError, readCompanionJson } from '@/lib/companion/core/http';
import { completePairing } from '@/lib/companion/core/repository';
import { COMPANION_ID, COMPANION_PROOF, COMPANION_TOKEN, matches } from '@/lib/companion/core/validation';

export async function POST(request: Request) {
    return companionResponse(async () => {
        const body = await readCompanionJson(request);
        if (!matches(body.id, COMPANION_ID) || !matches(body.verifier, COMPANION_PROOF) || !matches(body.token, COMPANION_TOKEN)) {
            throw new CompanionError('Invalid pairing proof');
        }
        return completePairing(body.id, body.verifier, body.token);
    });
}
