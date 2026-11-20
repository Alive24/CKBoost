module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/campaign/authorization.test.ts','<rootDir>/src/campaign/actor-proof.test.ts'],
  transform: {'^.+\\.ts$': ['ts-jest', {tsconfig: {target:'es2020',module:'commonjs',esModuleInterop:true}}]},
  moduleNameMapper: {'^(\\.{1,2}/.*)\\.js$':'$1'},
};
