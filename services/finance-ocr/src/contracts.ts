import type {
    FinanceCandidatePayload,
    FinanceCandidateTransaction,
    FinanceCategory,
    FinanceDuplicateOutcome,
    FinanceDuplicateSignal,
    FinanceIntakeItem,
    FinanceRule,
    FinanceSource,
    FinanceSourceDetectionSignal,
    FinanceTransaction,
} from '@/lib/types';

export interface AuthenticatedUser {
    id: string;
}

export interface FinanceContext {
    sources: FinanceSource[];
    rules: FinanceRule[];
    categories: Pick<FinanceCategory, 'id' | 'type'>[];
}

export interface BeginIntakeResult {
    state: 'started' | 'recovered' | 'busy' | 'terminal';
    shouldProcess: boolean;
    intake: FinanceIntakeItem;
    candidate: FinanceCandidateTransaction | null;
    transaction: FinanceTransaction | null;
    attemptId: string;
    retryAfterSeconds?: number;
}

export interface DuplicateAssessment {
    outcome: FinanceDuplicateOutcome;
    matchedTransactionId: string | null;
    score: number;
    signals: FinanceDuplicateSignal[];
    explanation: string;
}

export interface FinalizeInput {
    userId: string;
    intakeId: string;
    attemptId: string;
    ocrRawText: string;
    ocrNormalizedText: string;
    ocrConfidence: number | null;
    ocrTextHash: string;
    normalizerVersion: number;
    detectedSourceId: string | null;
    sourceDetectionSignals: FinanceSourceDetectionSignal[];
    candidatePayload: FinanceCandidatePayload;
    candidateConfidence: number;
    matchedRuleId: string | null;
    duplicate: DuplicateAssessment;
}

export interface OcrSuccessData {
    intake: FinanceIntakeItem;
    candidate: FinanceCandidateTransaction;
    transaction: FinanceTransaction | null;
    auto_confirmed: boolean;
    recovered?: boolean;
}

export interface FinanceRepository {
    authenticate(accessToken: string): Promise<AuthenticatedUser | null>;
    canAccessFinance(userId: string): Promise<boolean>;
    beginIntake(input: {
        userId: string;
        imageHash: string;
        originalFilename: string;
        attemptId: string;
        leaseSeconds: number;
        processingVersion: number;
    }): Promise<BeginIntakeResult>;
    loadContext(userId: string): Promise<FinanceContext>;
    assessDuplicate(input: {
        userId: string;
        intakeId: string;
        ocrTextHash: string;
        amount: number | null;
        merchant: string | null;
        transactionDate: string | null;
        sourceId: string | null;
        referenceNumber: string | null;
    }): Promise<DuplicateAssessment>;
    finalize(input: FinalizeInput): Promise<OcrSuccessData>;
    fail(input: {
        userId: string;
        intakeId: string;
        attemptId: string;
        failureCode: string;
        failureStage: string;
        errorMessage: string;
    }): Promise<void>;
}
