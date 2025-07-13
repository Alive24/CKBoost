# Address Utilities

This module provides utilities for working with CKB addresses using the CCC library.

## Computing Lock Hash from Address

### Quick Answer

For the address: `ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqq9zuyhnp0wmjejcpznmn7srdduvxa5r4xgr7wmxq`

**Lock Hash (64 characters):** `608e6846ba5e83c969aa93349551db03fd450b92dfd6e1ed55970fa5f4635b6a`

**Lock Hash (with 0x prefix):** `0x608e6846ba5e83c969aa93349551db03fd450b92dfd6e1ed55970fa5f4635b6a`

### Usage

```typescript
import { computeLockHashFromAddress, computeLockHashWithPrefix } from "@/lib/utils/address-utils"

// Get lock hash without 0x prefix (64 characters)
const lockHash = await computeLockHashFromAddress(address)
console.log(lockHash) // "608e6846ba5e83c969aa93349551db03fd450b92dfd6e1ed55970fa5f4635b6a"

// Get lock hash with 0x prefix
const lockHashWithPrefix = await computeLockHashWithPrefix(address)
console.log(lockHashWithPrefix) // "0x608e6846ba5e83c969aa93349551db03fd450b92dfd6e1ed55970fa5f4635b6a"
```

### How It Works

1. **Parse Address**: Uses `ccc.Address.fromString(address, client)` to parse the CKB address
2. **Extract Script**: Gets the lock script from the parsed address object (`addr.script`)
3. **Compute Hash**: Uses the script's `hash()` method to compute the lock hash
4. **Format Result**: Returns the hash with or without the "0x" prefix as needed

### Lock Script Details

The parsed address contains a lock script with these components:

```javascript
{
  codeHash: '0xd23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac',
  hashType: 'type',
  args: '0x000145c25e617bb72ccb0114f73f406d6f186ed07532'
}
```

The lock hash is computed from this entire script structure.

### Additional Utilities

- `validateCKBAddress(address)` - Validates CKB address format
- `formatAddressForDisplay(address)` - Formats address for UI display (short form)

### Error Handling

The functions will throw an error if:
- The address is invalid or malformed
- The CCC library fails to parse the address
- The network is unreachable (for client operations)

Make sure to wrap calls in try-catch blocks for proper error handling.