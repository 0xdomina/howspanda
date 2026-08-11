// Nigerian bank name ↔ Paystack code map (mirror of the storefront's list).
// Sellers pick their bank by NAME; the code is what gets stored on payout
// accounts. When we surface a seller's account to a buyer at checkout we need
// the reverse lookup so the bank name can be rendered without a second call.
export type Bank = { name: string; code: string }

export const NIGERIAN_BANKS: Bank[] = [
  { name: "Access Bank", code: "044" },
  { name: "Citibank Nigeria", code: "023" },
  { name: "Ecobank Nigeria", code: "050" },
  { name: "Fidelity Bank", code: "070" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "First City Monument Bank (FCMB)", code: "214" },
  { name: "Globus Bank", code: "001" },
  { name: "Guaranty Trust Bank (GTBank)", code: "058" },
  { name: "Heritage Bank", code: "030" },
  { name: "Jaiz Bank", code: "301" },
  { name: "Keystone Bank", code: "082" },
  { name: "Kuda Bank", code: "50211" },
  { name: "Moniepoint", code: "50515" },
  { name: "Opay", code: "999992" },
  { name: "Palmpay", code: "999991" },
  { name: "Parallex Bank", code: "104" },
  { name: "Polaris Bank", code: "076" },
  { name: "Providus Bank", code: "101" },
  { name: "Stanbic IBTC Bank", code: "221" },
  { name: "Standard Chartered Bank", code: "068" },
  { name: "Sterling Bank", code: "232" },
  { name: "SunTrust Bank", code: "100" },
  { name: "Union Bank of Nigeria", code: "032" },
  { name: "United Bank for Africa (UBA)", code: "033" },
  { name: "Unity Bank", code: "215" },
  { name: "Wema Bank", code: "035" },
  { name: "Zenith Bank", code: "057" },
]

const BY_CODE = new Map(NIGERIAN_BANKS.map((b) => [b.code, b.name]))
const BY_NAME = new Map(NIGERIAN_BANKS.map((b) => [b.name, b.code]))

export const bankNameByCode = (code: string): string | undefined =>
  BY_CODE.get(code)

export const bankCodeByName = (name: string): string | undefined =>
  BY_NAME.get(name)
