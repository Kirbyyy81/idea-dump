# Hybrid Postpaid API Reference

## Source and scope

Converted from **Hybrid Postpaid Plan - YESSHOP.pdf**, seven pages, originally supplied as **Hybrid Postpaid Plan - YESSHOP (1).pdf**.

This reference preserves all seven endpoint sections, both upload variants, complete request and response examples, and the source's explicit requirements. Highlighted changes are recorded as text so they remain understandable without colour.

HTTP methods, base URLs, authentication headers, error contracts and requirements not explicitly stated below are **not specified in the source**. Example values do not establish additional allowed values or required fields.

Conversion notes: PDF page breaks were joined; indentation was standardised; unquoted object keys were quoted and invalid trailing commas removed. Mandatory/allowed-option annotations were moved outside the JSON into parameter tables. Three extraction spacing artefacts were corrected against the rendered PDF. The two `sessionId` values were replaced with `REDACTED_SESSION_TOKEN`; all other example fields and values are retained. No API calls were executed.

The source uses `E_RELOAD` for account creation and `ERELOAD` for account management. These distinct values, date formats and field-name casing are preserved.

## 1. Customer lookup

Endpoint: `/mobile/ws/v1/json/GetCustomerDetailsByIdentificationNo`

Existing API: added `operationType`. The highlighted example value is `HYBRID_POSTPAID`.

### Parameters and source notes

| Field | Requirement in source | Notes |
| --- | --- | --- |
| `operationType` | Not specified | Example: `HYBRID_POSTPAID`. Newly added parameter. |

### Request

```json
{
  "countryOfPassport": "INDIA",
  "dateOfBirth": "1983-08-17",
  "secId": "P5833558",
  "operationType": "HYBRID_POSTPAID",
  "planType": "prepaid",
  "secType": "PASSPORT"
}
```

Response: not provided in the source.

## 2. Plan list

Endpoint: `/mobile/ws/v1/json/getPlanList`

Existing API: added `queryType`. The highlighted example value is `HYBRID_POSTPAID`.

### Parameters and source notes

| Field | Requirement in source | Notes |
| --- | --- | --- |
| `queryType` | Not specified | Example: `HYBRID_POSTPAID`. Newly added parameter. |

### Request

```json
{
  "securityType": "MYKAD",
  "securityId": "930120086023",
  "queryType": "HYBRID_POSTPAID",
  "isPlanConversion": "N",
  "partNumber": "-1"
}
```

Response: not provided in the source.

## 3. Plan pricing

Endpoint: `/mobile/ws/v1/json/getPlanPriceInfo`

Existing API: added `connections[].multipleAddonDetails`, with `offerCode` and `offerType`. The PDF highlights the array and its first example item. Both connections and all three add-on items are preserved below.

### Parameters and source notes

| Field | Requirement in source | Notes |
| --- | --- | --- |
| `connections[].multipleAddonDetails` | Not specified | New add-on array; item examples contain `offerCode` and `offerType`. |

### Request

```json
{
  "address1": "KAMPUNG PURAK PAPAR SABAH",
  "city": "PAPAR",
  "connections": [
    {
      "partNumber": "-1",
      "planCode": "100044",
      "sequenceNo": "1",
      "reloadAmount": "30",
      "multipleAddonDetails": [
        {
          "offerCode": "PRD06404",
          "offerType": "4"
        },
        {
          "offerCode": "PRD06404",
          "offerType": "4"
        }
      ]
    },
    {
      "partNumber": "-1",
      "planCode": "100044",
      "sequenceNo": "2",
      "reloadAmount": "30",
      "multipleAddonDetails": [
        {
          "offerCode": "PRD06404",
          "offerType": "4"
        }
      ]
    }
  ],
  "country": "MALAYSIA",
  "custCode": "500100150",
  "custName": "JACQUELYNE BINTI PILIN",
  "email": "lucky@gmail.com",
  "mobilePhone": "01738000000",
  "planType": "NEW",
  "postCode": "89600",
  "state": "SABAH",
  "type": "HYBRID_POSTPAID"
}
```

Response: not provided in the source.

## 4. Upload documents

Endpoint: `/tablet/ws/v1/json/uploadDocument`

New API for customer image and signature uploads. Both variants use the same endpoint.

### Parameters and source notes

| Field | Requirement in source | Notes |
| --- | --- | --- |
| `uploadType` | Not specified | Examples: `yesshop-cust-image` and `yesshop-cust-sign`. |
| `securityType` | Not specified | Example: `PASSPORT`. |
| `securityId` | Not specified | Identification value, as shown in each request example. |
| `uploadFile` | Required by upload instructions | Send the file as multipart, as in registration final submit. The multipart parameter name is `uploadFile`. |

### Request: customer image

```json
{
  "uploadType": "yesshop-cust-image",
  "securityType": "PASSPORT",
  "securityId": "N11047366"
}
```

Send the file as multipart using the parameter name `uploadFile`, as in registration final submit. The JSON above shows the accompanying request values; the source does not specify the multipart encoding of those values.

### Request: customer signature

```json
{
  "uploadType": "yesshop-cust-sign",
  "securityType": "PASSPORT",
  "securityId": "N11047366"
}
```

Send the file as multipart using the parameter name `uploadFile`, as in registration final submit. The JSON above shows the accompanying request values; the source does not specify the multipart encoding of those values.

Response: not provided in the source.

## 5. Final submit account

Endpoint: `/tablet/ws/v1/json/processHybridPostpaidAccountCreation`

Final account submission. The example contains two connections, using `RELOAD_VOUCHER` and `E_RELOAD` respectively. Both connection entries are retained, including their repeated example number and device serial.

### Parameters and source notes

| Field | Requirement in source | Notes |
| --- | --- | --- |
| `newConnectionCustomerDto` | Not specified | Customer object, including `customerImageDocumentId` and `customerSignature`. |
| `newConnectionCreationList` | Not specified | Connection array; preserve the distinct payment values `RELOAD_VOUCHER` and `E_RELOAD` shown below. |

### Request

```json
{
  "newConnectionCustomerDto": {
    "custCode": "CUST-80012345",
    "name": "RAJINDRA DIAS",
    "securityType": "PASSPORT",
    "securityId": "900101145678",
    "dateOfBirth": "01-01-1990",
    "emailAddress": "rajindra.dias@example.com",
    "mobileNo": "0123456789",
    "address": "12, Jalan Bukit Bintang",
    "city": "Kuala Lumpur",
    "state": "Wilayah Persekutuan",
    "postalCode": "55100",
    "country": "Malaysia",
    "countryOfPassport": "",
    "customerImageDocumentId": 1001,
    "customerSignature": 2001
  },
  "newConnectionCreationList": [
    {
      "agreementPlanCode": "HYB-PST-129",
      "msisdn": "0182000002",
      "totalAmount": 30.0,
      "reloadAmount": 30.0,
      "deductionType": "RELOAD_VOUCHER",
      "activationCode": "1234522",
      "addonDetails": [
        {
          "offerCode": "ADD-DATA-10GB",
          "offerType": "4",
          "isConvertAddon": "N"
        }
      ],
      "deviceDetails": [
        {
          "deviceType": "SIM",
          "serialNumber": "8996101SIMSERIAL02",
          "partNumber": "-1"
        }
      ]
    },
    {
      "agreementPlanCode": "HYB-PST-129",
      "msisdn": "0182000002",
      "totalAmount": 30.0,
      "reloadAmount": 30.0,
      "deductionType": "E_RELOAD",
      "addonDetails": [],
      "deviceDetails": [
        {
          "deviceType": "SIM",
          "serialNumber": "8996101SIMSERIAL02",
          "partNumber": "-1"
        }
      ]
    }
  ]
}
```

Response: not provided in the source.

## 6. Hybrid postpaid plan details

Endpoint: `/tablet/ws/v1/json/getHybridPostpaidPlanDetails`

New API to fetch Hybrid postpaid plan details.

### Parameters and source notes

| Field | Requirement in source | Notes |
| --- | --- | --- |
| `msisdn` | Mandatory | The source explicitly marks this field mandatory. |

### Request

```json
{
  "msisdn": "01892168510"
}
```

### Response

```json
{
  "loginId": null,
  "responseId": null,
  "responseCode": 0,
  "responseMessage": null,
  "displayResponseMessage": null,
  "contentData": null,
  "sessionId": "REDACTED_SESSION_TOKEN",
  "apiKey": null,
  "messageKey": null,
  "accountInfo": {
    "accountName": "MUHAMMAD ZIYAD BIN AZHARI",
    "planName": "InfinitePlus Premium Upfront Vivo X300 FE 36M",
    "contractPeriod": "36Months - 34 months Mnth(s) remaining",
    "accountValidity": "21 May 2029"
  },
  "creditLimit": "RM 130.00",
  "billingInfo": {
    "outstandingBill": "0.00",
    "dueDate": null,
    "billingCycle": "22"
  },
  "activeAddonList": [
    {
      "addonName": "Yes RM15 10GB",
      "expiryDate": "22JUL2026",
      "addonAmount": null,
      "autoRenew": "N"
    },
    {
      "addonName": "Kasi Up 30Days 10GB_RM15",
      "expiryDate": "13AUG2026",
      "addonAmount": null,
      "autoRenew": "N"
    },
    {
      "addonName": "Kasi Up 30Days 10GB_RM15",
      "expiryDate": "24JUL2026",
      "addonAmount": null,
      "autoRenew": "N"
    }
  ]
}
```

## 7. Manage account

Endpoint: `/tablet/ws/v1/json/processSubmitManageAccount`

New API to process account management operations.

### Parameters and source notes

| Field | Requirement in source | Notes |
| --- | --- | --- |
| `operationType` | Mandatory | Allowed options: `CREDIT_LIMIT`, `BILL_PAYMENT`, `ADDON`. |
| `amount` | Mandatory | Example: `"30.00"` (string). |
| `reloadType` | Mandatory | Allowed options: `CVP`, `RELOAD_VOUCHER`, `ERELOAD`. |
| `msisdn` | Mandatory | The source explicitly marks this field mandatory. |
| `reloadAmount` | Not specified | Example: `"Reload 30"`. |
| `eReloadSerialNo` | Not specified | Example: empty string. |
| `activationCode` | Not specified | Example: empty string. |
| `multipleAddonDetails` | Not specified | Array containing `offerCode`, `addonName` and `isConvertAddon`. |

### Request

```json
{
  "operationType": "BILL_PAYMENT",
  "amount": "30.00",
  "reloadType": "ERELOAD",
  "msisdn": "01892252470",
  "reloadAmount": "Reload 30",
  "eReloadSerialNo": "",
  "activationCode": "",
  "multipleAddonDetails": [
    {
      "offerCode": "",
      "addonName": "",
      "isConvertAddon": ""
    }
  ]
}
```

### Response

```json
{
  "loginId": null,
  "responseId": null,
  "responseCode": 0,
  "responseMessage": "SUCCESS",
  "displayResponseMessage": "Successfully Processed",
  "contentData": null,
  "sessionId": "REDACTED_SESSION_TOKEN",
  "apiKey": null,
  "messageKey": null
}
```

## Change log

- 2026-09-24: Initial PDF-to-Markdown conversion for the Notion Document Hub. Preserved seven endpoint sections and ten complete JSON examples, converted highlighted changes and mandatory annotations to explicit notes, and replaced two session-token values with placeholders. Checked against all seven source pages and validated all ten examples as JSON. This is document conversion verification, not an API implementation audit.
