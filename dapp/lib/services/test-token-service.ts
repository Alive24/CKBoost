import { ccc } from "@ckb-ccc/connector-react";
import { udtRegistry } from "./udt-registry";
import { debug } from "../utils/debug";

/**
 * Test Token Service
 * Utilities for acquiring test UDT tokens on testnet
 */
export class TestTokenService {
  private signer: ccc.Signer;

  constructor(signer: ccc.Signer) {
    this.signer = signer;
  }

  /**
   * Check if a UDT token appears to be a test token based on common patterns
   */
  isTestToken(token: any): boolean {
    // Common test token patterns
    const testPatterns = [
      'test',
      'demo',
      'example',
      'faucet'
    ];
    
    const nameAndSymbol = `${token.name}${token.symbol}`.toLowerCase();
    return testPatterns.some(pattern => nameAndSymbol.includes(pattern));
  }

  /**
   * Get faucet information for test tokens
   */
  getTestTokenInfo() {
    const tokens = udtRegistry.getAllTokens();
    const testTokens = tokens.filter(token => token.network === "testnet");

    return testTokens.map(token => {
      const script = ccc.Script.from({
        codeHash: token.script.codeHash,
        hashType: token.script.hashType,
        args: token.script.args
      });

      return {
        symbol: token.symbol,
        name: token.name,
        scriptHash: script.hash(),
        decimals: token.decimals,
        script: token.script,
        // For testnet tokens, we might have specific faucet addresses
        faucetInfo: this.getFaucetInfo(token.symbol)
      };
    });
  }

  /**
   * Get faucet information for specific tokens
   */
  private getFaucetInfo(symbol: string): any {
    // This would normally connect to a faucet service
    // For now, return placeholder info
    const faucetMap: Record<string, any> = {
      'RUSD': {
        type: 'manual',
        instructions: 'Contact testnet admin or use test token minter dApp',
        minAmount: '1000000000', // 10 RUSD minimum
        maxAmount: '100000000000' // 1000 RUSD maximum
      },
      'BTCPP': {
        type: 'manual',
        instructions: 'Contact testnet admin or use test token minter dApp',
        minAmount: '100000000', // 1 BTCPP minimum
        maxAmount: '10000000000' // 100 BTCPP maximum
      }
    };

    return faucetMap[symbol] || {
      type: 'unavailable',
      instructions: 'No faucet available for this token'
    };
  }

  /**
   * Create a simple UDT mint transaction (for test tokens only)
   * NOTE: This requires the minter to have appropriate permissions
   */
  async mintTestTokens(
    tokenSymbol: string,
    amount: bigint
  ): Promise<ccc.Transaction | null> {
    try {
      const token = udtRegistry.getTokenBySymbol(tokenSymbol);
      if (!token) {
        throw new Error(`Token ${tokenSymbol} not found in registry`);
      }

      if (token.network !== "testnet") {
        throw new Error("Can only mint test tokens on testnet");
      }

      debug.info("Test token minting", {
        symbol: tokenSymbol,
        amount: amount.toString(),
        recipient: await this.signer.getRecommendedAddress()
      });

      // NOTE: Actual minting would require:
      // 1. Access to the UDT issuer/owner lock
      // 2. Proper minting permissions
      // 3. Following the specific UDT standard (sUDT/xUDT)
      
      // For now, we just log the requirement
      debug.warn("Manual token acquisition required", {
        message: "Please use one of the following methods to acquire test tokens:",
        methods: [
          "1. Use the CKB testnet faucet if it supports UDT distribution",
          "2. Contact the testnet administrator for test tokens",
          "3. Deploy your own test UDT contract for development",
          "4. Use an existing test token minter dApp if available"
        ],
        tokenInfo: {
          symbol: token.symbol,
          name: token.name,
          script: token.script,
          requiredAmount: udtRegistry.formatAmount(amount, token)
        }
      });

      return null;
    } catch (error) {
      debug.error("Failed to prepare test token mint", error);
      return null;
    }
  }

  /**
   * Find cells that could potentially provide test tokens
   */
  async findPotentialTokenSources(tokenSymbol: string): Promise<any[]> {
    try {
      const token = udtRegistry.getTokenBySymbol(tokenSymbol);
      if (!token) {
        throw new Error(`Token ${tokenSymbol} not found`);
      }

      const udtScript = ccc.Script.from({
        codeHash: token.script.codeHash,
        hashType: token.script.hashType,
        args: token.script.args
      });

      // Find cells with this UDT type
      const collector = this.signer.client.findCells({
        script: udtScript,
        scriptType: "type",
        scriptSearchMode: "exact"
      });

      const sources: any[] = [];
      let count = 0;
      const maxSources = 5;

      for await (const cell of collector) {
        if (count >= maxSources) break;
        
        // Check if this could be a faucet or test distribution cell
        const lockScript = cell.cellOutput.lock;
        const capacity = cell.cellOutput.capacity;
        
        sources.push({
          lockHash: lockScript.hash(),
          capacity: capacity.toString(),
          udtAmount: cell.outputData ? ccc.numLeFromBytes(cell.outputData.slice(0, 16)).toString() : "0",
          // Could check if this is a known faucet address
          isPotentialFaucet: capacity > ccc.fixedPointFrom(1000) // Large capacity might indicate faucet
        });
        
        count++;
      }

      debug.info("Found potential token sources", {
        token: tokenSymbol,
        sourcesFound: sources.length,
        sources
      });

      return sources;
    } catch (error) {
      debug.error("Failed to find token sources", error);
      return [];
    }
  }

  /**
   * Generate instructions for acquiring test tokens
   */
  getAcquisitionInstructions(tokenSymbol: string): string[] {
    const token = udtRegistry.getTokenBySymbol(tokenSymbol);
    if (!token) {
      return ["Token not found in registry"];
    }

    const instructions = [
      `Token: ${token.name} (${token.symbol})`,
      `Network: ${token.network}`,
      `Decimals: ${token.decimals}`,
      "",
      "How to acquire test tokens:",
      "1. Check if there's a testnet faucet that distributes this token",
      "2. Ask in the CKB Discord/Telegram for test tokens",
      "3. Deploy your own test UDT for development:",
      "   - Use the CKB UDT deployment tools",
      "   - Set yourself as the owner/issuer",
      "   - Mint tokens to your address",
      "",
      "Token Script Details:",
      `Code Hash: ${token.script.codeHash}`,
      `Hash Type: ${token.script.hashType}`,
      `Args: ${token.script.args}`,
      "",
      "Your wallet address:",
      "Loading..."
    ];

    return instructions;
  }
}

// Export singleton instance
let testTokenServiceInstance: TestTokenService | null = null;

export function getTestTokenService(signer: ccc.Signer): TestTokenService {
  if (!testTokenServiceInstance || testTokenServiceInstance.signer !== signer) {
    testTokenServiceInstance = new TestTokenService(signer);
  }
  return testTokenServiceInstance;
}