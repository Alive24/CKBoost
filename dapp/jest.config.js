const nextJest = require('next/jest')

/** @type {import('jest').Config} */
const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
})

// Add any custom config to be passed to Jest
const config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/test/current-deployment-env.cjs'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Jest 29 runs CommonJS; exercise Marked's same-version published browser
    // build instead of mocking the parser or loading its ESM-only Node entry.
    '^marked$': '<rootDir>/node_modules/marked/lib/marked.umd.js',
    '^ckb-claimable-pool-lock$':
      '<rootDir>/../contracts/contracts/claimable-pool-lock/ts/src/index.ts',
    '^ssri-ckboost/types$': '<rootDir>/../packages/ssri-ckboost/src/generated/index.ts',
    '^ssri-ckboost/logging$': '<rootDir>/../packages/ssri-ckboost/dist/logging/index.js',
    '^uncrypto$': '<rootDir>/test/mocks/uncrypto.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/.netlify/',
    '<rootDir>/node_modules/',
  ],
  modulePathIgnorePatterns: ['<rootDir>/.netlify/'],
  collectCoverageFrom: [
    'lib/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(config)
