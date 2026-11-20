import { ccc } from "@ckb-ccc/connector-react";
import type { ContributorProtocol } from "./contributor-data";
import { extractTypeIdFromUserCell, isUserCellConnectedToProtocol, parseUserData } from "@/lib/ckb/user-cells";
import { submissionRecordMatchesQuest } from "@/lib/user-submission-records";

export async function loadContributorStats(client:ccc.Client,protocolCell:ccc.Cell,protocol:ContributorProtocol,campaignId:string,questIds:readonly number[],cancelled:()=>boolean){
  const protocolHash=protocolCell.cellOutput.type?.hash();
  if(!protocolHash)throw new Error("The protocol identity is missing.");
  const participants=new Set<string>(),responses=new Set<string>();
  for await(const cell of client.findCells({script:{codeHash:ccc.hexFrom(protocol.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash),hashType:"type",args:"0x"},scriptType:"type",scriptSearchMode:"prefix"})){
    if(cancelled())throw new Error("Statistics request cancelled.");
    if(!isUserCellConnectedToProtocol(cell,protocolHash))continue;
    const userId=extractTypeIdFromUserCell(cell),user=parseUserData(cell);
    if(!userId || !user)throw new Error("Some contributor records could not be read.");
    for(const questId of questIds)if(user.submission_records.some(record=>submissionRecordMatchesQuest(record,campaignId as ccc.Hex,questId))){participants.add(userId.toLowerCase());responses.add(`${userId.toLowerCase()}:${questId}`);}
  }
  return{participants:participants.size,submissions:responses.size};
}
