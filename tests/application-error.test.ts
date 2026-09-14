import { describe, expect, it } from 'vitest';
import { ApplicationError, isApplicationError } from '@/lib/api/applicationError';
import { applicationErrorResponse } from '@/lib/api/responses';

describe('ApplicationError', () => {
    it('uses safe defaults and can be identified across application modules', () => {
        const error = new ApplicationError('Invalid request');

        expect(error).toMatchObject({
            message: 'Invalid request',
            name: 'ApplicationError',
            status: 400,
        });
        expect(isApplicationError(error)).toBe(true);
        expect(isApplicationError(new Error('Invalid request'))).toBe(false);
    });

    it('preserves the existing message-only service response shape', async () => {
        const response = applicationErrorResponse(
            new ApplicationError('Transaction not found', { status: 404 })
        );

        expect(response?.status).toBe(404);
        await expect(response?.json()).resolves.toEqual({ error: 'Transaction not found' });
    });

    it('preserves Finance response details', async () => {
        const response = applicationErrorResponse(
            new ApplicationError('Transaction is invalid', {
                status: 422,
                details: { field_errors: { amount: 'Amount must be positive' } },
            })
        );

        expect(response?.status).toBe(422);
        await expect(response?.json()).resolves.toEqual({
            error: 'Transaction is invalid',
            field_errors: { amount: 'Amount must be positive' },
        });
    });

    it('preserves Ticket error codes and user-readable messages', async () => {
        const response = applicationErrorResponse(
            new ApplicationError('Ticket not found', {
                code: 'Not found',
                status: 404,
            })
        );

        expect(response?.status).toBe(404);
        await expect(response?.json()).resolves.toEqual({
            error: 'Not found',
            message: 'Ticket not found',
        });
    });

    it('does not convert unexpected errors into client responses', () => {
        expect(applicationErrorResponse(new Error('Database connection failed'))).toBeNull();
    });
});
