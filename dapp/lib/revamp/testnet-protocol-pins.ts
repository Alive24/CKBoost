/** Public identities verified on2026-11-19. This is not an active deployment registry. */
export const TESTNET_PROTOCOL_DEPENDENCY_PINS = [
  {
    "name": "ckboostProtocolType",
    "codeHash": "0x53769be2ed1d09a9da7c1d71488347449bb76f1212068f7e366939d0d5fd59fa",
    "hashType": "type",
    "outPoint": {
      "txHash": "0x131dd30a2a21722c39229421668bebc661b65bffccded3c8de95f66a633aae83",
      "index": 0
    },
    "dataHash": "0x898cf68d889645a7aae925623273a2490e1506dd1fa37a62732f07270fdb4bfc",
    "dataBytes": 301816
  },
  {
    "name": "ckboostUserType",
    "codeHash": "0xe78893f4703d27e6dc9a8a6495ab86f2e14d51f83c0eb21de0ae5e4437027fe6",
    "hashType": "type",
    "outPoint": {
      "txHash": "0xb4ce620861a60767fb15d43d53f7059d090df7538bcb806f2bc5d776c4fe1534",
      "index": 0
    },
    "dataHash": "0x76dbd826aa15708eee36d857fde53b92eb7904bfd0e6fe0ccf6d16c263bc4382",
    "dataBytes": 361256
  },
  {
    "name": "ckboostPointsUdt",
    "codeHash": "0xfcb4b762e3222b603771811b8abe6b054a480a0f5d8011fd9fff266d72189a5e",
    "hashType": "type",
    "outPoint": {
      "txHash": "0xd006b31cfd6a5360f607ac067590a88b10847ecea84ccde11788493b7eeb3e3f",
      "index": 0
    },
    "dataHash": "0xb61c56ff5d0b9d036f0db63d67ec9cf9d8cb62a20d9de1830659b92261bb150b",
    "dataBytes": 138784
  },
  {
    "name": "ckboostFundingLock",
    "codeHash": "0x4098902247983e930aca2dc7425600e356ea9a06e25a39d74d4bd796fe395268",
    "hashType": "type",
    "outPoint": {
      "txHash": "0x6fe46c5219a39e101c992de818424f197839683deecb3ec33a2f1cf7460c8b06",
      "index": 0
    },
    "dataHash": "0xb6352f08723a2824c583cf15f52e9ae716c6b1400f51bf010110cf77ff399896",
    "dataBytes": 284264
  },
  {
    "name": "ckboostTippingType",
    "codeHash": "0x6bc4f9266a2b146d235f9004859e7cb13a58fc688687bdd41567b0e97779fc01",
    "hashType": "type",
    "outPoint": {
      "txHash": "0xb1e6c2e04be8f1ae54062e14c17b9dea3264e9ddae45825735647f4f803e97e7",
      "index": 0
    },
    "dataHash": "0x6ab025c16d61a4b9405a4d3cabd115c3725b6a24faa94695b1345924bd58b225",
    "dataBytes": 383744
  },
  {
    "name": "ckboostAchievementType",
    "codeHash": "0x7130876c4a85364fc964fd5677632b6c174d10bcd3bc9ab8323d66f709c99f98",
    "hashType": "type",
    "outPoint": {
      "txHash": "0x0991236377af51673670f90acc65de6ba82d1bc98ca7c755f498e34bfabfac7e",
      "index": 0
    },
    "dataHash": "0xf50e78e33b54910a69a637464d9ffdb8d759d614d47fbde1f67776b7906507e9",
    "dataBytes": 315872
  },
  {
    "name": "claimablePoolLock",
    "codeHash": "0x458cacb13a3c40e6d046468e7fe3f5c2c93f0581062e269dc9ffec4858346cb6",
    "hashType": "type",
    "outPoint": {
      "txHash": "0x96194f05b7c341fbe0d865129f8f3a2f50c62981afd9fac698d58237d710d6c0",
      "index": 0
    },
    "dataHash": "0x07aace477ec2a6a11c108037be54bb3ecc2cd003b5db6a5e1a4adf3a5c403fb1",
    "dataBytes": 56600
  }
] as const;

export type ProtocolDependencyName = typeof TESTNET_PROTOCOL_DEPENDENCY_PINS[number]["name"];
