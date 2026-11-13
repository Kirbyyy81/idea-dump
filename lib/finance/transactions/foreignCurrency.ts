import type { FinanceForeignDetails } from '@/lib/types';

// Keep in sync with finance_private.foreign_details_valid. Pin the list so browser,
// server and database accept the same currencies even when their ICU versions differ.
const supported = new Set('AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HRK HTG HUF IDR ILS INR IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XCG XOF XPF YER ZAR ZMW ZWG ZWL'.split(' '));

export function normalizeForeignCurrency(value: unknown) {
    const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
    return supported.has(code) ? code : null;
}

export function normalizeForeignAmount(value: unknown) {
    const text = typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
    if (!/^\d{1,12}(?:\.\d{1,4})?$/.test(text)) return null;
    const [whole, fraction = ''] = text.split('.');
    const integer = whole.replace(/^0+(?=\d)/, '');
    const decimal = fraction.replace(/0+$/, '');
    return integer !== '0' || decimal ? integer + (decimal ? '.' + decimal : '') : null;
}

export function foreignFormDetails(fields: FinanceForeignDetails) {
    return { foreign_amount: fields.foreign_amount ?? '', foreign_currency: fields.foreign_currency ?? '' };
}

type ForeignField = keyof FinanceForeignDetails;
export type ForeignForm = Record<ForeignField, string>;

export function parseForeignDetails(fields: Partial<Record<ForeignField, unknown>>) {
    const amount = fields.foreign_amount;
    const currency = fields.foreign_currency;
    const blank = (value: unknown) => value == null || (typeof value === 'string' && !value.trim());
    if (blank(amount) && blank(currency)) {
        return { details: { foreign_amount: null, foreign_currency: null } };
    }
    const foreignAmount = normalizeForeignAmount(amount);
    const foreignCurrency = normalizeForeignCurrency(currency);
    if (foreignAmount && foreignCurrency) return { details: { foreign_amount: foreignAmount, foreign_currency: foreignCurrency } };
    const errors: Partial<Record<ForeignField, string>> = {};
    if (!foreignAmount) errors.foreign_amount = 'Enter a positive foreign amount with up to four decimal places';
    if (!foreignCurrency) errors.foreign_currency = 'Enter a supported currency code other than MYR';
    return { errors };
}

export function formatFinanceForeignDetails(myrAmount: number | string, details: FinanceForeignDetails) {
    const amount = normalizeForeignAmount(details.foreign_amount);
    const currency = normalizeForeignCurrency(details.foreign_currency);
    if (!amount || !currency || !Number.isFinite(Number(myrAmount)) || Number(myrAmount) <= 0) return null;
    const [whole, fraction] = amount.split('.');
    const displayAmount = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.' + fraction.padEnd(2, '0') : '.00');
    const rate = new Intl.NumberFormat('en-MY', { maximumSignificantDigits: 8 }).format(Number(myrAmount) / Number(amount));
    return `${currency} ${displayAmount} · 1 ${currency} = MYR ${rate}`;
}
