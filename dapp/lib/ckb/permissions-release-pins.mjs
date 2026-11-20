// Exact permissions release candidates. Activation additionally requires the
// reviewed upgrade transaction and independently confirmed on-chain evidence.
// No environment/file override is accepted for these bytes.
export const PERMISSION_REVIEW_RELEASES = Object.freeze({
  "protocol-lock": Object.freeze({
    name: "Protocol lock", fileName: "ckboost-protocol-lock", byteLength: 183920,
    dataHash: "0x4085400035c0812c58b432e004a57f8befe987df6e67b8cd2a7e7fc75118cf65",
  }),
  "campaign-type": Object.freeze({
    name: "Campaign type", fileName: "ckboost-campaign-type", byteLength: 256040,
    dataHash: "0xb8f0ebe8ad9d28ed1c9018fceeeee8e52bea23863dc39d1a4213abe7422ffa33",
  }),
});
