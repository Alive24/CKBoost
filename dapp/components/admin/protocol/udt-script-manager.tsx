import React from "react";
import { ccc } from "@ckb-ccc/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Plus, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface UDTScriptManagerProps {
  scripts: ccc.ScriptLike[];
  onChange: (scripts: ccc.ScriptLike[]) => void;
  title?: string;
  description?: string;
  placeholder?: string;
}

export function UDTScriptManager({
  scripts,
  onChange,
  title = "UDT Type Scripts",
  description = "Manage accepted UDT type scripts with full script configuration",
  placeholder = "0x..."
}: UDTScriptManagerProps) {
  const handleAddScript = () => {
    onChange([
      ...scripts,
      {
        codeHash: "0x",
        hashType: "type" as ccc.HashType,
        args: "0x"
      }
    ]);
  };

  const handleRemoveScript = (index: number) => {
    onChange(scripts.filter((_, i) => i !== index));
  };

  const handleUpdateScript = (index: number, field: keyof ccc.ScriptLike, value: string) => {
    const updatedScripts = [...scripts];
    
    // Clean up the value based on the field
    let cleanedValue = value;
    
    if (field === 'hashType') {
      cleanedValue = value as ccc.HashType;
    } else if (field === 'codeHash' || field === 'args') {
      // Ensure hex values are properly formatted
      cleanedValue = value.trim();
      
      // If it's empty or just "0x", use "0x"
      if (!cleanedValue || cleanedValue === '0x') {
        cleanedValue = '0x';
      } else {
        // Remove any spaces and ensure it starts with 0x
        cleanedValue = cleanedValue.replace(/\s+/g, '');
        if (!cleanedValue.startsWith('0x')) {
          cleanedValue = '0x' + cleanedValue;
        }
        
        // Validate hex string (must be 0x followed by even number of hex chars)
        const hexPattern = /^0x[0-9a-fA-F]*$/;
        if (!hexPattern.test(cleanedValue)) {
          // If invalid, keep the previous value
          return;
        }
        
        // Ensure even number of hex characters (after 0x)
        const hexPart = cleanedValue.slice(2);
        if (hexPart.length % 2 !== 0) {
          // Pad with a leading zero if odd
          cleanedValue = '0x0' + hexPart;
        }
      }
    }
    
    updatedScripts[index] = {
      ...updatedScripts[index],
      [field]: cleanedValue
    };
    onChange(updatedScripts);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-base font-medium">{title}</Label>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>

      <div className="space-y-3">
        {scripts.map((script, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Script #{index + 1}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveScript(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid gap-3">
                  <div>
                    <Label htmlFor={`codeHash-${index}`} className="text-xs">
                      Code Hash {(!script.codeHash || script.codeHash === '0x') && <span className="text-red-500">*</span>}
                    </Label>
                    <Input
                      id={`codeHash-${index}`}
                      placeholder={placeholder}
                      value={typeof script.codeHash === 'string' ? script.codeHash : ccc.hexFrom(script.codeHash)}
                      onChange={(e) => handleUpdateScript(index, 'codeHash', e.target.value)}
                      className={`font-mono text-xs ${(!script.codeHash || script.codeHash === '0x') ? 'border-red-500' : ''}`}
                    />
                    {(!script.codeHash || script.codeHash === '0x') && (
                      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Code hash is required
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={`hashType-${index}`} className="text-xs">
                        Hash Type
                      </Label>
                      <Select
                        value={typeof script.hashType === 'string' ? script.hashType : 'type'}
                        onValueChange={(value) => handleUpdateScript(index, 'hashType', value)}
                      >
                        <SelectTrigger id={`hashType-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="type">Type</SelectItem>
                          <SelectItem value="data">Data</SelectItem>
                          <SelectItem value="data1">Data1</SelectItem>
                          <SelectItem value="data2">Data2</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor={`args-${index}`} className="text-xs">
                        Args (optional)
                      </Label>
                      <Input
                        id={`args-${index}`}
                        placeholder="0x (empty)"
                        value={typeof script.args === 'string' ? script.args : ccc.hexFrom(script.args)}
                        onChange={(e) => handleUpdateScript(index, 'args', e.target.value || '0x')}
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddScript}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add UDT Script
        </Button>
      </div>
    </div>
  );
}