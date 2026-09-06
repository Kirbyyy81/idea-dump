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
        loadContext: vi.fn().mockResolvedValue({
            sources: [],
            sourceTemplates: [],
            fieldTemplates: [],
            rules: [],
            fieldLearningRules: [],
            payees: [],
        }),
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

    it('passes active source-template matches through parsing and durable source evidence', async () => {
        const sourceId = '11111111-1111-4111-8111-111111111111';
        const templateId = '33333333-3333-4333-8333-333333333333';
        const fieldTemplateId = '44444444-4444-4444-8444-444444444444';
        const repo = repository({
            beginIntake: vi.fn().mockResolvedValue({
                state: 'started',
                shouldProcess: true,
                intake: { id: 'intake-1' },
                candidate: null,
                transaction: null,
                attemptId: 'attempt-1',
            }),
            loadContext: vi.fn().mockResolvedValue({
                sources: [{
                    id: sourceId,
                    name: 'Synthetic Wallet',
                    filename_aliases: [],
                    ocr_aliases: [],
                    is_archived: false,
                }],
                sourceTemplates: [{
                    id: templateId,
                    user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                    target_source_id: sourceId,
                    scope_source_id: null,
                    field_name: 'source_id',
                    template_type: 'source_phrase',
                    configuration: { type: 'source_phrase', phrase: 'wallet transfer complete', location: 'header' },
                    algorithm_version: 1,
                    template_version: 1,
                    status: 'active',
                    evidence_count: 5,
                    contradiction_count: 0,
                    evaluation_count: 5,
                    precision: 1,
                    coverage: 0.8,
                    predecessor_template_id: null,
                    status_reason: null,
                    created_at: '2026-01-01T00:00:00Z',
                    evaluated_at: '2026-01-02T00:00:00Z',
                    activated_at: '2026-01-03T00:00:00Z',
                    disabled_at: null,
                    updated_at: '2026-01-03T00:00:00Z',
                }],
                fieldTemplates: [{
                    id: fieldTemplateId,
                    user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                    target_source_id: null,
                    scope_source_id: sourceId,
                    field_name: 'reference_number',
                    template_type: 'same_line_label',
                    configuration: { type: 'same_line_label', label: 'Reference' },
                    algorithm_version: 1,
                    template_version: 1,
                    status: 'active',
                    evidence_count: 5,
                    contradiction_count: 0,
                    evaluation_count: 5,
                    precision: 1,
                    coverage: 0.8,
                    predecessor_template_id: null,
                    status_reason: null,
                    created_at: '2026-01-01T00:00:00Z',
                    evaluated_at: '2026-01-02T00:00:00Z',
                    activated_at: '2026-01-03T00:00:00Z',
                    disabled_at: null,
                    updated_at: '2026-01-03T00:00:00Z',
                }],
                rules: [],
                fieldLearningRules: [],
                payees: [],
            }),
            finalize: vi.fn().mockResolvedValue({
                intake: { id: 'intake-1', status: 'review' },
                candidate: { id: 'candidate-1', status: 'pending' },
                transaction: null,
                auto_confirmed: false,
            }),
        });

        await processScreenshot('user-1', { ...image, originalFilename: 'Screenshot.png' }, config, {
            repository: repo,
            recognize: vi.fn().mockResolvedValue({
                rawText: 'Wallet Transfer Complete\nPaid RM 12.50\n15/07/2026\nReference: syn-12345',
                confidence: 91,
            }),
        });

        expect(repo.finalize).toHaveBeenCalledWith(expect.objectContaining({
            detectedSourceId: sourceId,
            sourceDetectionSignals: expect.arrayContaining([
                expect.objectContaining({
                    kind: 'learned_source_active',
                    template_id: templateId,
                }),
            ]),
            candidatePayload: expect.objectContaining({
                reference_number: 'SYN-12345',
                matched_parser_template_ids: [fieldTemplateId],
                parser_template_evaluations: [expect.objectContaining({
                    template_id: fieldTemplateId,
                    outcome: 'applied',
                })],
            }),
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
