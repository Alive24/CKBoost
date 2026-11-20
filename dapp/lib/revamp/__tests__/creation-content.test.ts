import { creationDateInput, creationUnixTime, decodeCreationDescription, encodeCreationDescription, requiredResponse } from "../creation-content";

describe("backward-compatible campaign scheduling content",()=>{
  it("leaves legacy rich content exactly unchanged when no extension exists",()=>{
    const description='<h2>Legacy campaign</h2>\n<p>A &amp; B</p>\n ';
    expect(decodeCreationDescription(description)).toEqual({description});
    expect(decodeCreationDescription(encodeCreationDescription(description,"Asia/Shanghai"))).toEqual({description,timeZone:"Asia/Shanghai"});
  });
  it("replaces an existing zone comment without duplicating metadata",()=>{
    const encoded=encodeCreationDescription(encodeCreationDescription("Description","UTC"),"Europe/London");
    expect(encoded.match(/ckboost-campaign-settings/g)).toHaveLength(1);
    expect(decodeCreationDescription(encoded)).toEqual({description:"Description",timeZone:"Europe/London"});
  });
  it.each(["%broken",encodeURIComponent('{"timeZone":"javascript:alert(1)"}'),encodeURIComponent('{"timeZone":123}'),"x".repeat(3000)])("strips a malformed or oversized extension without trusting its zone",value=>{
    expect(decodeCreationDescription(`Legacy\n<!--ckboost-campaign-settings:v1:${value}-->`)).toEqual({description:"Legacy"});
  });
  it("converts the selected IANA wall clock to exact Unix seconds and round-trips",()=>{
    const seconds=creationUnixTime("2026-11-18T16:30","Asia/Shanghai");
    expect(seconds).toBe(Date.parse("2026-11-18T08:30:00Z")/1000);
    expect(creationDateInput(seconds,"Asia/Shanghai")).toBe("2026-11-18T16:30");
    expect(creationDateInput(seconds,"UTC")).toBe("2026-11-18T08:30");
  });
  it("uses the offset on the scheduled date, including half-hour zones and DST",()=>{
    expect(creationUnixTime("2026-07-15T09:00","America/New_York")).toBe(Date.parse("2026-07-15T13:00Z")/1000);
    expect(creationUnixTime("2026-12-15T09:00","America/New_York")).toBe(Date.parse("2026-12-15T14:00Z")/1000);
    expect(creationUnixTime("2026-11-18T09:00","Asia/Kolkata")).toBe(Date.parse("2026-11-18T03:30Z")/1000);
  });
  it("rejects impossible calendars, nonexistent clocks and ambiguous clocks",()=>{
    expect(()=>creationUnixTime("2026-02-30T09:00","UTC")).toThrow("calendar");
    expect(()=>creationUnixTime("2026-03-08T02:30","America/New_York")).toThrow("does not exist");
    expect(()=>creationUnixTime("2026-11-01T01:30","America/New_York")).toThrow("occurs twice");
  });
  it("keeps undefined legacy response flags distinct from explicit optional and required",()=>{
    expect(requiredResponse({title:"Legacy"})).toBeUndefined();
    expect(requiredResponse({required_response:"true"})).toBeUndefined();
    expect(requiredResponse({required_response:false})).toBe(false);
    expect(requiredResponse({required_response:true})).toBe(true);
  });
});
