import '@testing-library/jest-dom'

// Mock CKB CCC library for testing
jest.mock('@ckb-ccc/connector-react', () => ({
  ccc: {
    ClientPublicTestnet: jest.fn().mockImplementation(() => ({
      // Mock client implementation
    })),
    Address: {
      fromString: jest.fn(),
    },
    Script: {
      from: jest.fn().mockImplementation((script) => ({
        hash: () => `0x${script.codeHash.slice(2, 10)}${script.args.slice(2, 10)}${'0'.repeat(48)}`,
      })),
    },
  },
}))

// Mock console.error for cleaner test output
const originalError = console.error
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})