import { ccc } from "@ckb-ccc/connector-react";
import { debug } from "../utils/debug";
import { fetchUDTCellsByType, calculateUDTBalance } from "../ckb/udt-cells";

/**
 * UDT Token definition
 */
export interface UDTToken {
  network: "testnet" | "mainnet",
  symbol: string;
  name: string;
  decimals: number;
  script: ccc.ScriptLike;
  contractScript: ccc.ScriptLike;
  iconUrl?: string;
  ssri?: boolean
}

/**
 * Local UDT Registry
 * TODO: This will be replaced with an external service in the future
 * 
 * These are example testnet UDT scripts - replace with actual deployed UDT scripts
 */
const UDT_REGISTRY: UDTToken[] = [
  {
    network: "testnet",
    symbol: "RUSD",
    name: "Test RUSD Coin",
    decimals: 8,
    script: {
      codeHash: "0x1142755a044bf2ee358cba9f2da187ce928c91cd4dc8692ded0337efa677d21a" as ccc.Hex,
      hashType: "type" as ccc.HashType,
      args: "0x878fcc6f1f08d48e87bb1c3b3d5083f23f8a39c5d5c764f253b55b998526439b" as ccc.Hex // Example args for USDC
    },
    contractScript: {
      codeHash: "0x00000000000000000000000000000000000000000000000000545950455f4944",
      hashType: "type",
      args: "0x97d30b723c0b2c66e9cb8d4d0df4ab5d7222cbb00d4a9a2055ce2e5d7f0d8b0f"
    },
    ssri: false
  },
  {
    network: "testnet",
    symbol: "BTCPP",
    name: "Test BTC wrapped for RUSD",
    decimals: 8,
    script: {
      codeHash: "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb" as ccc.Hex,
      hashType: "type" as ccc.HashType,
      args: "0x6d0cc2e3a8059f36dbee473e14b2b05d19a4d69f5bfd2a7abdc71fd32eece546" as ccc.Hex // Example args for USDT
    },
    contractScript: {
      codeHash: "0x00000000000000000000000000000000000000000000000000545950455f4944",
      hashType: "type",
      args: "0x44ec8b96663e06cc94c8c468a4d46d7d9af69eaf418f6390c9f11bb763dda0ae"
    },
    ssri: false
  },
];

/**
 * UDT Registry Service
 * Manages UDT token definitions and provides utility functions
 */
export class UDTRegistryService {
  private registry: Map<string, UDTToken>;

  constructor() {
    this.registry = new Map();
    // Initialize with local registry
    UDT_REGISTRY.forEach(token => {
      this.registry.set(token.symbol.toUpperCase(), token);
    });
  }

  /**
   * Get all available UDT tokens
   */
  getAllTokens(): UDTToken[] {
    return Array.from(this.registry.values());
  }

  /**
   * Get UDT token by symbol
   */
  getTokenBySymbol(symbol: string): UDTToken | undefined {
    return this.registry.get(symbol.toUpperCase());
  }

  /**
   * Get UDT token by script hash
   */
  getTokenByScriptHash(scriptHash: string): UDTToken | undefined {
    for (const token of this.registry.values()) {
      const script = ccc.Script.from({
        codeHash: token.script.codeHash,
        hashType: token.script.hashType,
        args: token.script.args
      });
      if (script.hash().toLowerCase() === scriptHash.toLowerCase()) {
        return token;
      }
    }
    return undefined;
  }

  /**
   * Format UDT amount with proper decimals
   */
  formatAmount(amount: bigint | string | number, token: UDTToken): string {
    const value = BigInt(amount);
    const divisor = BigInt(10 ** token.decimals);
    const integerPart = value / divisor;
    const fractionalPart = value % divisor;
    
    if (fractionalPart === 0n) {
      return integerPart.toString();
    }
    
    // Pad fractional part with leading zeros
    const fractionalStr = fractionalPart.toString().padStart(token.decimals, '0');
    // Remove trailing zeros
    const trimmedFractional = fractionalStr.replace(/0+$/, '');
    
    return `${integerPart}.${trimmedFractional}`;
  }

  /**
   * Parse formatted amount to raw value
   */
  parseAmount(formattedAmount: string, token: UDTToken): bigint {
    const parts = formattedAmount.split('.');
    const integerPart = BigInt(parts[0] || 0);
    
    if (parts.length === 1) {
      return integerPart * BigInt(10 ** token.decimals);
    }
    
    // Handle fractional part
    const fractionalStr = parts[1].padEnd(token.decimals, '0').slice(0, token.decimals);
    const fractionalPart = BigInt(fractionalStr);
    
    return integerPart * BigInt(10 ** token.decimals) + fractionalPart;
  }

  /**
   * Get UDT balance for a wallet
   */
  async getBalance(token: UDTToken, signer: ccc.Signer): Promise<{
    raw: bigint;
    formatted: string;
  }> {
    try {
      const udtScript = ccc.Script.from({
        codeHash: token.script.codeHash,
        hashType: token.script.hashType,
        args: token.script.args
      });
      
      // Get user's address to find their UDT cells
      const lockScript = (await signer.getRecommendedAddressObj()).script;
      
      // Find all cells with this UDT type that belong to the user
      const collector = signer.client.findCellsByLock(
        lockScript,
        udtScript,
        true,
      );
      
      const cells: ccc.Cell[] = [];
      for await (const cell of collector) {
        // Check if the cell's lock script matches the user's lock script
        if (cell.cellOutput.lock.hash() === lockScript.hash()) {
          cells.push(cell);
        }
      }
      
      const balance = calculateUDTBalance(cells);
      
      return {
        raw: balance,
        formatted: this.formatAmount(balance, token)
      };
    } catch (error) {
      debug.error(`Failed to get balance for ${token.symbol}:`, error);
      return {
        raw: 0n,
        formatted: "0"
      };
    }
  }

  /**
   * Validate if user has sufficient balance
   */
  async validateBalance(
    token: UDTToken,
    requiredAmount: bigint | string,
    signer: ccc.Signer
  ): Promise<{ valid: boolean; balance: bigint; required: bigint }> {
    const balance = await this.getBalance(token, signer);
    const required = typeof requiredAmount === 'string' 
      ? this.parseAmount(requiredAmount, token)
      : BigInt(requiredAmount);
    
    return {
      valid: balance.raw >= required,
      balance: balance.raw,
      required
    };
  }

  /**
   * Create a UDT asset structure for quest rewards
   */
  createUDTAsset(token: UDTToken, amount: bigint | string): {
    udt_script: ccc.ScriptLike;
    amount: bigint;
  } {
    const rawAmount = typeof amount === 'string'
      ? this.parseAmount(amount, token)
      : BigInt(amount);
    
    return {
      udt_script: {
        codeHash: token.script.codeHash,
        hashType: token.script.hashType,
        args: token.script.args
      },
      amount: rawAmount
    };
  }

  /**
   * Get display info for a UDT script
   */
  getDisplayInfo(udtScript: ccc.ScriptLike): {
    symbol: string;
    name: string;
    decimals: number;
  } | undefined {
    const script = ccc.Script.from(udtScript);
    const scriptHash = script.hash();
    const token = this.getTokenByScriptHash(scriptHash);
    
    if (!token) {
      return undefined;
    }
    
    return {
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals
    };
  }
}

// Export singleton instance
export const udtRegistry = new UDTRegistryService();