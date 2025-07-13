# CKBoost dApp Tests

This directory contains comprehensive tests for the CKBoost decentralized application.

## Testing Framework

- **Jest**: Main testing framework
- **React Testing Library**: For component testing
- **@testing-library/jest-dom**: Additional Jest matchers for DOM assertions

## Test Structure

```
__tests__/
├── lib/
│   └── utils/
│       ├── address-utils.test.ts    # CKB address utility tests
│       └── campaign-utils.test.ts   # Campaign utility tests
└── README.md                        # This file
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

## Test Categories

### Address Utilities (`address-utils.test.ts`)

Tests for CKB address handling functions:

- **computeLockHashFromAddress**: Converts CKB addresses to lock hashes using CCC library
- **computeLockHashWithPrefix**: Same as above but returns hash with 0x prefix
- **validateCKBAddress**: Validates CKB address format (testnet/mainnet)
- **formatAddressForDisplay**: Shortens addresses for UI display

**Key Test Areas:**
- Valid testnet and mainnet address handling
- Error handling for invalid addresses
- Lock hash computation accuracy
- Address validation logic
- Display formatting

### Campaign Utilities (`campaign-utils.test.ts`)

Tests for campaign-related helper functions:

- **getDaysUntilEnd**: Calculates days remaining until campaign end
- **getDerivedStatus**: Determines campaign status based on end date
- **isEndingSoon**: Checks if campaign is ending within 30 days
- **formatDate**: Formats dates for display

**Key Test Areas:**
- Date calculations with various scenarios
- Status derivation logic
- Edge cases (expired campaigns, invalid dates)
- Integration between utility functions

## Mocking Strategy

### CKB CCC Library Mocking

The CCC library is mocked in `jest.setup.js` to avoid blockchain calls during testing:

```javascript
jest.mock('@ckb-ccc/connector-react', () => ({
  ccc: {
    ClientPublicTestnet: jest.fn(),
    Address: { fromString: jest.fn() },
    Script: { from: jest.fn() }
  }
}))
```

### Date Mocking

Campaign tests use fake timers to ensure consistent date-based calculations:

```javascript
beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2024-01-15T12:00:00.000Z'))
})
```

## Test Data

### Known CKB Address for Testing

The tests use a real CKB testnet address for validation:
- **Address**: `ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqq9zuyhnp0wmjejcpznmn7srdduvxa5r4xgr7wmxq`
- **Expected Lock Hash**: `608e6846ba5e83c969aa93349551db03fd450b92dfd6e1ed55970fa5f4635b6a`

## Configuration

### Jest Configuration (`jest.config.js`)

- Uses Next.js Jest configuration
- Configured for jsdom environment
- Module name mapping for `@/` imports
- Coverage collection from lib and components directories

### Setup File (`jest.setup.js`)

- Imports `@testing-library/jest-dom` for DOM matchers
- Mocks CKB CCC library
- Filters console warnings for cleaner test output

## Best Practices

1. **Isolated Tests**: Each test is independent and doesn't rely on others
2. **Comprehensive Coverage**: Tests cover happy paths, error cases, and edge cases
3. **Real Data**: Uses actual CKB addresses and realistic scenarios
4. **Mocking Strategy**: External dependencies are properly mocked
5. **Performance Tests**: Includes tests for concurrent operations
6. **Integration Tests**: Tests that verify multiple functions work together

## Adding New Tests

When adding new utility functions, follow this pattern:

1. Create test file in appropriate subdirectory
2. Import the functions to test
3. Mock any external dependencies
4. Write tests for:
   - Happy path scenarios
   - Error cases
   - Edge cases
   - Integration scenarios
5. Update this README if needed

## Troubleshooting

### Common Issues

1. **Module Resolution**: Ensure `moduleNameMapper` in Jest config includes your import paths
2. **Async Functions**: Remember to `await` promises in tests
3. **Date Dependencies**: Use fake timers for consistent date-based tests
4. **CKB Library**: Ensure CCC library is properly mocked for offline testing

### Debugging Tests

```bash
# Run specific test file
pnpm test address-utils.test.ts

# Run tests with verbose output
pnpm test --verbose

# Debug specific test
pnpm test --testNamePattern="should compute lock hash"
```