import type { LogEvent } from '@/lib/types';

export function normalizeLogName(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase();
}

const yesShopAliases: Readonly<Record<string, readonly string[]>> = {
  getIcScanConfigData: ['GetMaterConfig'],
  getMaterConfig: ['GetMaterConfig'],
  getMasterConfigContentData: ['GetMaterConfig'],
  'getMaster Country list': ['GetMasterData'],
  getActivationsSummary: ['getActivationSummery'],
  getCollectionsSummary: ['getCollectionSummery'],
  getIncentiveAmount: ['incentiveAmount'],
  getCvpBalanceInfo: ['getCVPBalance'],
  getAddonListContentData: ['getReloadList'],
  GetBranchUserSalesTransactionsResponse: ['userSalesTransactions'],
  getTransactionSummary: ['getTxnSummery'],
  'getEkyc UploadImageContentData': ['uploadMyKadImage', 'uploadPassportImage'],
  getEkycUploadVideoContentData: ['verifyImageWithVideo'],
  getUserDataByIdentificationNoContentData: ['GetCustomerDetailsByIdentificationNo'],
  getStateByZipcodeContentData: ['GetStateCityByZipcode'],
  getProductDeviceList: ['getPlanDeviceList'],
  getPlanListRequest: ['getPlanListByDevice'],
  getCtosStatusContentData: ['VerifyCTOSCredit'],
  getMobileNumberContentData: ['GetMsisdnList'],
  getReserveNoContentData: ['ReserveMSISDN'],
  getVerifyDeviceContentData: ['VerifyDevicesAndReserveMsisdn'],
  planOrderPriceDetailRequest: ['getPlanPriceInfo'],
};

const normalizedAliases = new Map(Object.entries(yesShopAliases)
  .map(([name, endpoints]) => [normalizeLogName(name), endpoints.map(normalizeLogName)]));

export function contentEndpoints(event: LogEvent): readonly string[] {
  if (event.functionName) {
    const name = normalizeLogName(event.functionName);
    return event.source === 'yes-shop' ? normalizedAliases.get(name) ?? [name] : [name];
  }
  if (event.source !== 'ussp' || !event.bodyJson || typeof event.bodyJson !== 'object') return [];
  const body = event.bodyJson as Record<string, unknown>;
  const endpoints: string[] = [];
  if ('configName' in body) endpoints.push('getMasterConfig');
  if ('masterDataType' in body) endpoints.push('getMasterData');
  if ('amount' in body && 'requestId' in body) endpoints.push('validateOpeningAndClosingBalanceAmount');
  if ('manualCategoryName' in body) endpoints.push('getManuals');
  if (['partNo', 'planType', 'securityId', 'securityType'].every((key) => key in body)) {
    endpoints.push('getPlanListByDevice');
  }
  if (body.functionName === 'PREPAID_CUSTOMER_ID_IMAGE') endpoints.push('uploadSupportingDocumentToDb');
  return endpoints.map(normalizeLogName);
}
