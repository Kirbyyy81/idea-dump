import crypto from 'node:crypto';
import { hashApiKey } from './apiKeys';
import { createApiKeyRecord, listActiveApiKeys, revokeActiveApiKey } from './apiKeyRepository';

export async function listApiKeysForUser(userId: string) {
    return listActiveApiKeys(userId);
}

export async function createApiKeyForUser(userId: string, name: string) {
    const key = `id_${crypto.randomBytes(32).toString('hex')}`;
    const record = await createApiKeyRecord(userId, name, hashApiKey(key));

    return { ...record, key };
}

export async function revokeApiKeyForUser(userId: string, keyId: string) {
    return revokeActiveApiKey(userId, keyId);
}
