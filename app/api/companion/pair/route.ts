import { companionResponse, CompanionError, readCompanionJson } from '@/lib/companion/core/http';
import { beginPairing } from '@/lib/companion/core/repository';
import { COMPANION_PROOF, matches, pairingLabel } from '@/lib/companion/core/validation';

export async function POST(request: Request) {
    return companionResponse(async () => {
        const body = await readCompanionJson(request);
        const label = pairingLabel(body.device_label);
        if (!matches(body.verifier_hash, COMPANION_PROOF) || !label) throw new CompanionError('Invalid pairing request');
        const pairing = await beginPairing(body.verifier_hash, label);
        const origin = process.env.APP_ORIGIN || new URL(request.url).origin;
        return { ...pairing, verification_uri: new URL('/companion/pair?code=' + pairing.user_code, origin).toString(), interval: 5 };
    });
}
