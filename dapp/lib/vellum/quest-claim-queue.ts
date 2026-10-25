export type QuestClaimQueueRegistration = {
  rewardClaimTxHash: string;
  subjectDid: string;
};

type Registrar = (registration: QuestClaimQueueRegistration) => void;

let registrar: Registrar | null = null;

export function registerQuestClaimIssuance(
  rewardClaimTxHash: string,
  subjectDid: string,
): void {
  registrar?.({ rewardClaimTxHash, subjectDid });
}

export function setQuestClaimQueueRegistrar(value: Registrar | null): void {
  registrar = value;
}
