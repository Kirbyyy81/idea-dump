import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { CompanionError } from './http';
import type { CompanionDevice, CompanionPairingResult } from '@/lib/types';

export function hashCompanionSecret(value: string) { return createHash('sha256').update(value).digest('hex'); }

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await createAdminClient().rpc(name, args);
    if (error) {
        if (error.message === 'pairing_expired') throw new CompanionError('Pairing code expired. Start again on your phone.', 410);
        if (error.message === 'pairing_conflict') throw new CompanionError('Pairing request is already in use', 409);
        if (error.message === 'pairing_rate_limit') throw new CompanionError('Try pairing again in a minute', 429);
        throw new CompanionError('Pairing is unavailable', 503);
    }
    return data as T;
}

export function beginPairing(verifierHash: string, label: string) {
    return rpc<{ id: string; user_code: string; expires_at: string }>('companion_begin_pairing_v1', {
        p_id: randomUUID(), p_verifier_hash: verifierHash,
        p_user_code: randomBytes(4).toString('hex').toUpperCase(), p_device_label: label,
    });
}
async function claimPairingAttempt(userId: string) {
    // A separate RPC commits the allowance even if the subsequent lookup fails.
    if (!await rpc<boolean>('companion_claim_pairing_attempt_v1', { p_user_id: userId })) {
        throw new CompanionError('Too many pairing attempts. Try again in a minute.', 429);
    }
}
export async function approvePairing(userId: string, code: string) {
    await claimPairingAttempt(userId);
    return rpc<void>('companion_approve_pairing_v1', { p_user_id: userId, p_user_code: code });
}
export function completePairing(id: string, verifier: string, token: string) {
    return rpc<CompanionPairingResult>('companion_complete_pairing_v1', {
        p_id: id, p_verifier_hash: hashCompanionSecret(verifier), p_token_hash: hashCompanionSecret(token),
    });
}
export async function authenticateCompanion(token: string) {
    const rows = await rpc<{ device_id: string; user_id: string }[]>('companion_authenticate_v1', { p_token_hash: hashCompanionSecret(token) });
    if (!rows[0]) throw new CompanionError('Reconnect your companion', 401);
    return rows[0];
}
export async function listCompanionDevices(userId: string): Promise<CompanionDevice[]> {
    const { data, error } = await createAdminClient().from('companion_devices')
        .select('id,label,created_at,last_seen_at,revoked_at').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) throw new CompanionError('Could not load companion devices', 503);
    return data || [];
}
export async function revokeCompanionDevice(userId: string, id: string) {
    const { error } = await createAdminClient().from('companion_devices')
        .update({ revoked_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).is('revoked_at', null);
    if (error) throw new CompanionError('Could not disconnect companion', 503);
}
export async function getPairingLabel(userId: string, code: string) {
    await claimPairingAttempt(userId);
    const { data, error } = await createAdminClient().from('companion_pairing_requests')
        .select('device_label').eq('user_code', code).gt('expires_at', new Date().toISOString()).is('device_id', null).maybeSingle();
    if (error) throw new CompanionError('Could not load pairing request', 503);
    return data?.device_label as string | undefined;
}
