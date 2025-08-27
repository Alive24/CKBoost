/* eslint-disable react/no-unescaped-entities */
import React from "react";
import { ccc } from "@ckb-ccc/connector-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Plus, Coins, Users, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UDTAssetLike, AssetListLike } from "ssri-ckboost/types";

interface QuestRewardsConfigProps {
  rewards: AssetListLike;
  onChange: (rewards: AssetListLike) => void;
  initialQuota?: number;
  onInitialQuotaChange?: (initialQuota: number) => void;
  acceptedUDTScripts?: ccc.ScriptLike[];
}

export function QuestRewardsConfig({
  rewards,
  onChange,
  initialQuota = 0,
  onInitialQuotaChange,
  acceptedUDTScripts = []
}: QuestRewardsConfigProps) {
  const handlePointsChange = (points: string) => {
    onChange({
      ...rewards,
      points_amount: BigInt(points || 0)
    });
  };

  const handleAddUDTReward = () => {
    const newUDTAssets: UDTAssetLike[] = [
      ...(rewards.udt_assets || []),
      {
        udt_script: acceptedUDTScripts[0] || {
          codeHash: "",
          hashType: "type" as ccc.HashType,
          args: "0x"
        },
        amount: BigInt(0)
      }
    ];
    
    onChange({
      ...rewards,
      udt_assets: newUDTAssets
    });
  };

  const handleRemoveUDTReward = (index: number) => {
    const newUDTAssets = (rewards.udt_assets || []).filter((_, i) => i !== index);
    onChange({
      ...rewards,
      udt_assets: newUDTAssets
    });
  };

  const handleUpdateUDTReward = (index: number, updates: Partial<UDTAssetLike>) => {
    const newUDTAssets = [...(rewards.udt_assets || [])];
    newUDTAssets[index] = {
      ...newUDTAssets[index],
      ...updates
    };
    onChange({
      ...rewards,
      udt_assets: newUDTAssets
    });
  };

  const calculateTotalRequired = (udtAsset: UDTAssetLike): bigint => {
    if (initialQuota === 0) return BigInt(0);
    return ccc.numFrom(udtAsset.amount) * BigInt(initialQuota);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-5 w-5" />
          Quest Rewards Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Initial Quota */}
        {onInitialQuotaChange && (
          <div className="space-y-2">
            <Label htmlFor="initialQuota" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Initial Quota
            </Label>
            <Input
              id="initialQuota"
              type="number"
              min="0"
              value={initialQuota}
              onChange={(e) => onInitialQuotaChange(parseInt(e.target.value) || 0)}
              placeholder="0 (unlimited)"
            />
            <p className="text-xs text-muted-foreground">
              Set to 0 for unlimited completions. Otherwise, quest will close after this many users complete it.
            </p>
          </div>
        )}

        <Tabs defaultValue="points" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="points">Points</TabsTrigger>
            <TabsTrigger value="udt">UDT Tokens</TabsTrigger>
          </TabsList>

          <TabsContent value="points" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pointsReward">Points per Completion</Label>
              <Input
                id="pointsReward"
                type="number"
                min="0"
                value={rewards.points_amount?.toString() || "0"}
                onChange={(e) => handlePointsChange(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Points will be minted to users upon quest completion approval.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="udt" className="space-y-4">
            {acceptedUDTScripts.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No accepted UDT types configured in protocol. Configure accepted UDT scripts in protocol management first.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-3">
                  {(rewards.udt_assets || []).map((udtAsset, index) => (
                    <Card key={index}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">UDT Reward #{index + 1}</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveUDTReward(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <Label htmlFor={`udtType-${index}`} className="text-xs">
                              UDT Type
                            </Label>
                            <Select
                              value={ccc.hexFrom(udtAsset.udt_script.codeHash)}
                              onValueChange={(codeHash) => {
                                const selectedScript = acceptedUDTScripts.find(
                                  s => ccc.hexFrom(s.codeHash) === codeHash
                                );
                                if (selectedScript) {
                                  handleUpdateUDTReward(index, { udt_script: selectedScript });
                                }
                              }}
                            >
                              <SelectTrigger id={`udtType-${index}`}>
                                <SelectValue placeholder="Select UDT type" />
                              </SelectTrigger>
                              <SelectContent>
                                {acceptedUDTScripts.map((script, sIndex) => (
                                  <SelectItem 
                                    key={sIndex} 
                                    value={ccc.hexFrom(script.codeHash)}
                                  >
                                    {ccc.hexFrom(script.codeHash).slice(0, 10)}...
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label htmlFor={`udtAmount-${index}`} className="text-xs">
                              Amount per User (smallest unit)
                            </Label>
                            <Input
                              id={`udtAmount-${index}`}
                              type="number"
                              min="0"
                              value={udtAsset.amount?.toString() || "0"}
                              onChange={(e) => 
                                handleUpdateUDTReward(index, { 
                                  amount: BigInt(e.target.value || 0) 
                                })
                              }
                              placeholder="0"
                            />
                          </div>

                          {initialQuota > 0 && (
                            <div className="bg-muted p-2 rounded text-xs">
                              <p className="font-medium">Total Required:</p>
                              <p className="font-mono">{calculateTotalRequired(udtAsset).toString()} units</p>
                              <p className="text-muted-foreground mt-1">
                                Campaign must be funded with at least this amount before approving completions.
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddUDTReward}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add UDT Reward
                </Button>

                {rewards.udt_assets && rewards.udt_assets.length > 0 && initialQuota > 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Remember to fund your campaign with the required UDT amounts before approving quest completions.
                      The campaign will need to be funded with at least the "Total Required" amount for each configured UDT.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}