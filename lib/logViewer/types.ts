export type LogBodyKind = 'json' | 'text' | 'none';
export type LogLineType = 'request' | 'response' | 'content_data' | 'crash' | 'error' | 'other';
export type OrphanKind = 'request' | 'response' | 'content_data' | null;

export type LogEvent = {
  id: string;
  rawLine: string;
  lineNumber: number;
  endLineNumber?: number;
  timestamp: string;
  timestampMs?: number;
  lineType: LogLineType;
  eventType: string;
  method?: string;
  url?: string;
  endpointKey?: string;
  httpStatus?: number;
  functionName?: string;
  bodyKind?: LogBodyKind;
  bodyRaw?: string;
  bodyJson?: unknown;
  bodyParseError?: boolean;
};

export type PairingConfidence = 'high' | 'medium' | 'low' | 'unknown';

export type Transaction = {
  id: string;
  url?: string;
  endpointKey?: string;
  method?: string;
  request?: LogEvent;
  responses: LogEvent[];
  contentData?: LogEvent;
  lineRefs: number[];
  orphanKind: OrphanKind;
  orphanResponse?: boolean;
  startedAtMs?: number;
  endedAtMs?: number;
  confidence: PairingConfidence;
  hadConcurrency: boolean;
  closedReason?: 'paired' | 'timeout' | 'eof' | 'orphan';
};

export type UnparsedLogLine = {
  rawLine: string;
  lineNumber: number;
  reason?: string;
};

export type BuildTransactionsOptions = {
  inactivityTimeoutMs: number;
  nowMs?: number;
};

