import { randomBytes } from "node:crypto";

import { ccc } from "@ckb-ccc/core";

import type { QuestClaimRequest } from "@/lib/vellum/quest-claims";
import { rpcUrl, type QuestClaimEnvironment } from "./config";
import { broadcastPreparedQuestClaim, prepareQuestClaim } from "./issuer";
import { reconstructQuestCompletions } from "./provenance";
import { issueQuestClaims } from "./service";
import { NetlifyQuestClaimStore } from "./store";

export function issueQuestClaimsFromEnvironment(
  request: QuestClaimRequest,
  environment: QuestClaimEnvironment = process.env,
) {
  return issueQuestClaims(request, environment, {
    broadcast: broadcastPreparedQuestClaim,
    client: new ccc.ClientPublicTestnet({
      url: rpcUrl(environment),
      fallbacks: [],
      timeout: 10_000,
    }),
    now: () => Math.floor(Date.now() / 1_000),
    prepare: prepareQuestClaim,
    reconstruct: reconstructQuestCompletions,
    store: new NetlifyQuestClaimStore(),
    token: () => randomBytes(32).toString("base64url"),
  });
}
