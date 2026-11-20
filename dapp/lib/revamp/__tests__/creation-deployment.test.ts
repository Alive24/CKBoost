import { assertCreationEditDeployment, CreationDeploymentCapabilityError, parseCreationAuthLockHashes } from "../creation-deployment";
const lock=`0x${"ab".repeat(32)}`;
describe("Organizer deployment capability",()=>{
  it("defaults to no upgraded hashes and distinguishes upgrade state from authorization",()=>{
    expect([...parseCreationAuthLockHashes(undefined)]).toEqual([]);
    expect(()=>assertCreationEditDeployment(false,lock,"")).toThrow(CreationDeploymentCapabilityError);
    expect(()=>assertCreationEditDeployment(false,lock,"")).toThrow("Organizer access is confirmed");
  });
  it("allows only the actual input lock's complete upgraded code hash",()=>{
    expect(()=>assertCreationEditDeployment(false,lock,lock.toUpperCase())).not.toThrow();
    expect(()=>assertCreationEditDeployment(false,`0x${"cd".repeat(32)}`,lock)).toThrow("upgrade");
    expect([...parseCreationAuthLockHashes(`${lock}, ${lock.toUpperCase()}`)]).toEqual([lock]);
  });
  it.each(["0x1234",`${lock},not-a-hash`,`${lock}00`])("fails closed for malformed configuration without silently accepting prefixes",raw=>{
    expect(()=>parseCreationAuthLockHashes(raw)).toThrow(CreationDeploymentCapabilityError);
  });
  it("does not affect the existing admin path, including an unset or malformed allowlist",()=>{
    expect(()=>assertCreationEditDeployment(true,lock,"")).not.toThrow();
    expect(()=>assertCreationEditDeployment(true,lock,"invalid")).not.toThrow();
  });
});
