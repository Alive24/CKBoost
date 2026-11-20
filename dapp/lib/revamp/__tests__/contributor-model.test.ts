import { buildContributorSubmission, contributorDraftKey, contributorTasks, isContributorFile, parseContributorResponses, readContributorDraft, responseHasContent, validateContributorResponses } from "../contributor-model";

const hash=(letter:string)=>`0x${letter.repeat(64)}`;
describe("contributor evidence and local progress",()=>{
  it("requires one meaningful response for legacy quests, including blank rich text",()=>{
    expect(responseHasContent("<p>&nbsp;</p><!-- hidden -->")).toBe(false);
    expect(validateContributorResponses([{title:"A"},{title:"B"}],{0:"  ",1:"<p>&nbsp;</p>"})).toHaveProperty("0");
    expect(validateContributorResponses([{title:"A"},{title:"B"}],{1:"Evidence"})).toEqual({});
    expect(validateContributorResponses([{title:"A"}],{99:"Unrelated field"})).toHaveProperty("0");
    expect(validateContributorResponses([{title:"Optional",required_response:false}],{})).toHaveProperty("0");
  });
  it("enforces marked required fields without making optional fields mandatory",()=>{
    const tasks=[{title:"Required",required_response:true},{title:"Optional",required_response:false}];
    expect(validateContributorResponses(tasks,{1:"optional answer"})).toEqual({0:"This response is required."});
    expect(validateContributorResponses(tasks,{0:"done"})).toEqual({});
    expect(validateContributorResponses([{required_response:false}],{})).toHaveProperty("0");
  });
  it.each(["javascript:alert(1)","data:text/html,evil","ftp://example.com/file","not a URL"])("rejects unsafe or malformed link evidence: %s",value=>{
    expect(validateContributorResponses([{type:"Link"}],{0:value})).toHaveProperty("0");
  });
  it("accepts a public file URL or bounded inline file, inside the existing response string schema",()=>{
    const file=JSON.stringify({format:"ckboost-file",name:"proof.txt",type:"text/plain",size:1,data_url:"data:text/plain;base64,YQ=="});
    expect(isContributorFile(file)).toBe(true);
    expect(validateContributorResponses([{type:"File"}],{0:file})).toEqual({});
    expect(validateContributorResponses([{type:"File"}],{0:"https://example.com/proof.pdf"})).toEqual({});
    expect(isContributorFile(JSON.stringify({format:"ckboost-file",size:11*1024*1024}))).toBe(false);
    expect(isContributorFile("{}" )).toBe(false);
    expect(isContributorFile(JSON.stringify({format:"ckboost-file",name:"empty",type:"text/plain",size:1,data_url:"data:text/plain;base64,"}))).toBe(false);
    expect(isContributorFile(JSON.stringify({format:"ckboost-file",name:"wrong-size",type:"text/plain",size:2,data_url:"data:text/plain;base64,YQ=="}))).toBe(false);
  });
  it("isolates drafts by complete protocol, account, campaign and quest IDs",()=>{
    const key=contributorDraftKey(hash("a"),hash("b"),hash("c"),1);
    expect(key).toBe(contributorDraftKey(hash("a").toUpperCase(),hash("b"),hash("c"),1));
    for(const args of [[hash("d"),hash("b"),hash("c"),1],[hash("a"),hash("d"),hash("c"),1],[hash("a"),hash("b"),hash("d"),1],[hash("a"),hash("b"),hash("c"),2]] as const) expect(contributorDraftKey(args[0],args[1],args[2],args[3])).not.toBe(key);
    expect(()=>contributorDraftKey("0x123",hash("b"),hash("c"),1)).toThrow();
    expect(contributorDraftKey(hash("a"),hash("b"),hash("c"),0)).not.toBe(key);
    expect(()=>contributorDraftKey(hash("a"),hash("b"),hash("c"),-1)).toThrow();
  });
  it("does not restore corrupted or out-of-scope response fields",()=>{
    expect(readContributorDraft(JSON.stringify({version:1,responses:{0:"a"}}),1)).toEqual({0:"a"});
    for(const value of ["broken",JSON.stringify({version:2,responses:{0:"a"}}),JSON.stringify({version:1,responses:{1:"other quest field"}}),JSON.stringify({version:1,responses:{0:42}}),JSON.stringify({version:1,responses:[]})]) expect(readContributorDraft(value,1)).toBeNull();
  });
  it("round trips pending submission responses and preserves legacy text for editing",()=>{
    const payload=buildContributorSubmission([{title:"A",type:"Text"},{title:"B",type:"Link"}],{0:"<p>Original</p>",1:"https://example.com"},123);
    expect(JSON.parse(payload)).toMatchObject({format:"json",version:"1.0",timestamp:123});
    expect(parseContributorResponses(payload,2)).toEqual({0:"<p>Original</p>",1:"https://example.com"});
    expect(parseContributorResponses("original legacy response",2)).toEqual({0:"original legacy response"});
    expect(parseContributorResponses("nevent1unresolved",2)).toBeNull();
    expect(contributorTasks([])).toHaveLength(1);
  });
});
