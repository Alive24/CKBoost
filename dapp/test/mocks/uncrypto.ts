import { webcrypto } from "node:crypto";

export const getRandomValues = webcrypto.getRandomValues.bind(webcrypto);
export const randomUUID = webcrypto.randomUUID.bind(webcrypto);
export const subtle = webcrypto.subtle;

export default { getRandomValues, randomUUID, subtle };
