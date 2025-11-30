export interface TippingReleaseRequestPayload {
  txHex: string;
  tippingTypeId?: string;
}

export interface TippingReleaseResponseSuccess {
  success: true;
  txHex: string;
}

export interface TippingReleaseResponseError {
  success: false;
  error: string;
  message?: string;
}

export type TippingReleaseResponse =
  | TippingReleaseResponseSuccess
  | TippingReleaseResponseError;
