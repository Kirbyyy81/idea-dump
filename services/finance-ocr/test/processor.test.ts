import { describe, expect, it, vi } from 'vitest';
import type { FinanceRepository } from '../src/contracts.js';
import type { ValidatedImage } from '../src/image.js';
import { processScreenshot } from '../src/processor.js';

const config = {
    intakeLeaseSeconds: 300,
    processingVersion: 2,
    busyRetryAfterSeconds: 5,
};

const image: ValidatedImage = {
    buffer: Buffer.from('image'),
    originalFilename: 'Screenshot_Ryt_Bank.png',
    mimeType: 'image/png',
    width: 10,
    height: 10,
    imageHash: 'a'.repeat(64),
};

function repository(overrides: Partial<FinanceRepository> = {}) {
    return {
        authenticate: vi.fn(),
        canAccessFinance: vi.fn(),
        beginIntake: vi.fn(),
        loadContext: vi.fn().mockResolvedValue({ sources: [], rules: [], categories: [] }),
        assessDuplicate: vi.fn().mockResolvedValue({
            outcome: 'none',
            matchedTransactionId: null,
            score: 0,
            signals: [],
            explanation: 'No deterministic duplicate signals matched.',
        }),
        finalize: vi.fn(),
        fail: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    } as unknown as FinanceRepository;
}

describe('fenced screenshot processing', () => {
    it('recovers an existing confirmed result without running OCR again', async () => {
        const repo = repository({
            beginIntake: vi.fn().mockResolvedValue({
                state: 'terminal',
                shouldProcess: false,
                intake: { id: 'intake-1' },
                candidate: { id: 'candidate-1' },
                transaction: { id: 'transaction-1' },
                attemptId: 'attempt-new',
            }),
        });
        const recognize = vi.fn();

        const result = await processScreenshot('user-1', image, config, { repository: repo, recognize });

        expect(result.statusCode).toBe(200);
        expect(result.data).toMatchObject({
            auto_confirmed: true,
            recovered: true,
            transaction: { id: 'transaction-1' },
        });
        expect(recognize).not.toHaveBeenCalled();
        expect(repo.finalize).not.toHaveBeenCalled();
    });

    it('finalizes a new review candidate with the lease attempt token', async () => {
        const repo = repository({
            beginIntake: vi.fn().mockResolvedValue({
                state: 'started',
                shouldProcess: true,
                intake: { id: 'intake-1' },
                candidate: null,
                transaction: null,
                attemptId: 'attempt-1',
            }),
            finalize: vi.fn().mockResolvedValue({
                intake: { id: 'intake-1', status: 'review' },
                candidate: { id: 'candidate-1', status: 'pending' },
                transaction: null,
                auto_confirmed: false,
            }),
        });

        const result = await processScreenshot('user-1', image, config, {
            repository: repo,
            recognize: vi.fn().mockResolvedValue({
                rawText: 'Paid RM 12.50\n15/07/2026\nCoffee Shop',
                confidence: 91,
            }),
        });

        expect(result.statusCode).toBe(201);
        expect(result.data).toMatchObject({
            auto_confirmed: false,
            candidate: { id: 'candidate-1', status: 'pending' },
        });
        expect(repo.finalize).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'user-1',
            intakeId: 'intake-1',
            attemptId: 'attempt-1',
        }));
    });

    it('records a safe failed state when OCR is interrupted', async () => {
        const repo = repository({
            beginIntake: vi.fn().mockResolvedValue({
                state: 'started',
                shouldProcess: true,
                intake: { id: 'intake-1' },
                candidate: null,
                transaction: null,
                attemptId: 'attempt-1',
            }),
        });

        await expect(processScreenshot('user-1', image, config, {
            repository: repo,
            recognize: vi.fn().mockRejectedValue(new Error('worker crashed')),
        })).rejects.toMatchObject({ code: 'ocr_unavailable', statusCode: 503 });

        expect(repo.fail).toHaveBeenCalledWith({
            userId: 'user-1',
            intakeId: 'intake-1',
            attemptId: 'attempt-1',
            failureCode: 'ocr_unavailable',
            failureStage: 'ocr',
            errorMessage: 'Screenshot reading was interrupted. Please retry.',
        });
    });
});
