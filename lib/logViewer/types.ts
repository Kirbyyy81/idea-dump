export type LogBodyKind = 'json' | 'text' | 'none';

export type LogEvent = {
  rawLine: string;
  lineNumber: number;
  timestamp: string;
  timestampMs?: number;
  eventType: string;
  method?: string;
  url?: string;
  httpStatus?: number;
  bodyKind?: LogBodyKind;
  bodyRaw?: string;
  bodyJson?: unknown;
};

export type PairingConfidence = 'high' | 'medium' | 'low' | 'unknown';

export type Transaction = {
  id: string;
  url?: string;
  method?: string;
  request?: LogEvent;
  responses: LogEvent[];
  orphanResponse?: boolean;
  startedAtMs?: number;
  endedAtMs?: number;
  confidence: PairingConfidence;
  hadConcurrency: boolean;
  closedReason?: 'next_request' | 'timeout' | 'eof' | 'orphan';
};

export type BuildTransactionsOptions = {
  inactivityTimeoutMs: number;
  nowMs?: number;
};

