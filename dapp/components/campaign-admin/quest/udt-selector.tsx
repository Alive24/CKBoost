import React, { useState, useEffect } from "react";
import { ccc } from "@ckb-ccc/connector-react";
import { UDTToken, udtRegistry } from "@/lib/services/udt-registry";
import { useUDTBalance } from "@/hooks/use-udt-balance";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Wallet, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface UDTSelectorProps {
  value: {
    token?: UDTToken;
    amount: string;
  };
  onChange: (value: { token?: UDTToken; amount: string }) => void;
  signer?: ccc.Signer;
  disabled?: boolean;
  required?: boolean;
  showBalance?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
  includeCKB?: boolean;
}

export function UDTSelector({
  value,
  onChange,
  signer,
  disabled = false,
  required = false,
  showBalance = true,
  label = "UDT Reward",
  placeholder = "Enter amount",
  className,
  includeCKB = false
}: UDTSelectorProps) {
  const [tokens, setTokens] = useState<UDTToken[]>([]);
  const [selectedToken, setSelectedToken] = useState<UDTToken | undefined>(value.token);
  const [amount, setAmount] = useState(value.amount || "");
  const [amountError, setAmountError] = useState<string | null>(null);

  const balance = useUDTBalance(selectedToken, signer);

  useEffect(() => {
    const allTokens = udtRegistry.getAllTokens();
    const network = (process.env.NEXT_PUBLIC_CKB_NETWORK === 'testnet' ? 'testnet' : 'mainnet') as 'testnet' | 'mainnet'
    const list = includeCKB
      ? ([{
          network: network,
          symbol: 'CKB',
          name: 'CKB (native)',
          decimals: 8,
          script: { codeHash: '0x' as ccc.Hex, hashType: 'type' as ccc.HashType, args: '0x' as ccc.Hex },
          contractScript: { codeHash: '0x', hashType: 'type', args: '0x' }
        } as UDTToken] as UDTToken[]).concat(allTokens)
      : allTokens;
    setTokens(list);
    if (!selectedToken && list.length > 0) {
      setSelectedToken(list[0]);
    }
  }, []);

  useEffect(() => {
    // Update parent when token or amount changes
    onChange({ token: selectedToken, amount });
  }, [selectedToken, amount]);

  const handleTokenChange = (symbol: string) => {
    const token = tokens.find(t => t.symbol === symbol);
    setSelectedToken(token);
    validateAmount(amount, token);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAmount = e.target.value;
    setAmount(newAmount);
    validateAmount(newAmount, selectedToken);
  };

  const validateAmount = (amountStr: string, token?: UDTToken) => {
    if (!amountStr || !token) {
      setAmountError(null);
      return;
    }

    // Pre-validate simple numeric format to avoid throwing during BigInt conversion
    const s = amountStr.trim();
    if (!/^\d*(?:\.\d*)?$/.test(s)) {
      setAmountError("Invalid number format");
      return;
    }

    // Validate decimal places do not exceed token decimals
    const parts = s.split(".");
    if (parts.length > 1) {
      const frac = parts[1] ?? "";
      if (frac.length > token.decimals) {
        setAmountError(`Too many decimals (max ${token.decimals})`);
        return;
      }
    }

    try {
      // Convert to smallest units using bigint-safe logic
      const [ints, fracs = ""] = s.split(".");
      const decs = token.decimals;
      const fracPadded = (fracs + "0".repeat(decs)).slice(0, decs);
      const base = 10n ** BigInt(decs);
      const intPart = ints ? BigInt(ints) : 0n;
      const fracPart = fracPadded ? BigInt(fracPadded) : 0n;
      const rawAmount = intPart * base + fracPart;

      if (rawAmount <= 0n) {
        setAmountError("Amount must be greater than 0");
        return;
      }

      if (showBalance && signer && balance.raw < rawAmount) {
        setAmountError(`Insufficient balance. Available: ${balance.formatted} ${token.symbol}`);
        return;
      }

      setAmountError(null);
    } catch {
      setAmountError("Invalid number format");
    }
  };

  const formatBalance = () => {
    if (!selectedToken || !showBalance) return null;

    if (balance.loading) {
      return <RefreshCw className="w-3 h-3 animate-spin" />;
    }
    
    if (balance.error) {
      return (
        <span className="text-red-500 text-xs">
          <AlertCircle className="w-3 h-3 inline mr-1" />
          Error loading balance
        </span>
      );
    }
    
    return (
      <div className="flex items-center gap-1">
        <Wallet className="w-3 h-3" />
        <span className="text-sm">{balance.formatted} {selectedToken.symbol}</span>
      </div>
    );
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <Label htmlFor="udt-token" className="flex items-center justify-between">
          {label}
          {required && <span className="text-red-500 text-xs">*</span>}
        </Label>
        
        <div className="flex gap-2 mt-2">
          <Select
            value={selectedToken?.symbol}
            onValueChange={handleTokenChange}
            disabled={disabled}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select token" />
            </SelectTrigger>
            <SelectContent className="min-w-[240px]">
              {tokens.map((token) => (
                <SelectItem key={token.symbol} value={token.symbol}>
                  <div className="flex items-center justify-between w-full whitespace-nowrap gap-2">
                    <span className="font-medium">{token.symbol}</span>
                    <span className="text-xs text-muted-foreground ml-2 truncate">
                      {token.name}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex-1">
            <Input
              type="text"
              value={amount}
              onChange={handleAmountChange}
              placeholder={placeholder}
              disabled={disabled || !selectedToken}
              className={cn(
                amountError && "border-red-500",
                "font-mono"
              )}
            />
          </div>
        </div>
      </div>

      {/* Balance and error display */}
      <div className="flex items-center justify-between">
        <div>
          {showBalance && signer && selectedToken && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Balance:</span>
              {formatBalance()}
              {!balance.loading && !balance.error && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 px-1"
                  onClick={() => balance.refresh()}
                >
                  <RefreshCw className="w-3 h-3" />
                </Button>
              )}
            </div>
          )}
        </div>
        
        {amountError && (
          <span className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {amountError}
          </span>
        )}
      </div>

      {/* Token info */}
      {selectedToken && (
        <div className="text-xs text-muted-foreground space-y-1">
          <div>Decimals: {selectedToken.decimals}</div>
        </div>
      )}
    </div>
  );
}

interface MultiUDTSelectorProps {
  rewards: Array<{ token?: UDTToken; amount: string }>;
  onChange: (rewards: Array<{ token?: UDTToken; amount: string }>) => void;
  signer?: ccc.Signer;
  disabled?: boolean;
  showBalance?: boolean;
  maxRewards?: number;
}

export function MultiUDTSelector({
  rewards,
  onChange,
  signer,
  disabled = false,
  showBalance = true,
  maxRewards = 5
}: MultiUDTSelectorProps) {
  const handleAddReward = () => {
    if (rewards.length < maxRewards) {
      onChange([...rewards, { amount: "" }]);
    }
  };

  const handleRemoveReward = (index: number) => {
    onChange(rewards.filter((_, i) => i !== index));
  };

  const handleRewardChange = (index: number, value: { token?: UDTToken; amount: string }) => {
    const newRewards = [...rewards];
    newRewards[index] = value;
    onChange(newRewards);
  };

  return (
    <div className="space-y-4">
      {rewards.map((reward, index) => (
        <div key={index} className="relative">
          <UDTSelector
            value={reward}
            onChange={(value) => handleRewardChange(index, value)}
            signer={signer}
            disabled={disabled}
            showBalance={showBalance}
            label={`UDT Reward #${index + 1}`}
          />
          {rewards.length > 1 && !disabled && (
            <Button
              size="sm"
              variant="ghost"
              className="absolute top-0 right-0"
              onClick={() => handleRemoveReward(index)}
            >
              Remove
            </Button>
          )}
        </div>
      ))}
      
      {rewards.length < maxRewards && !disabled && (
        <Button
          variant="outline"
          onClick={handleAddReward}
          className="w-full"
        >
          Add Another UDT Reward
        </Button>
      )}
    </div>
  );
}
