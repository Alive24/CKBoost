import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Trash2, Sparkles, Lock } from "lucide-react"
import { ccc } from "@ckb-ccc/connector-react"
import type { QuestDataLike, QuestSubTaskDataLike } from "ssri-ckboost/types"
import { UDTSelector } from "./udt-selector"
import { UDTToken, udtRegistry } from "@/lib/services/udt-registry"
import { useProtocol } from "@/lib/providers/protocol-provider"

interface QuestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  questForm: QuestDataLike & { initial_quota: number }
  onQuestFormChange: (quest: QuestDataLike & { initial_quota: number }) => void
  onSave: () => void
  editMode: boolean
  localQuestsLength: number
  lockUDTOnSave?: boolean
  setLockUDTOnSave?: (lock: boolean) => void
}

export function QuestDialog({
  open,
  onOpenChange,
  questForm,
  onQuestFormChange,
  onSave,
  editMode,
  localQuestsLength,
  lockUDTOnSave = false,
  setLockUDTOnSave
}: QuestDialogProps) {
  const isCreateMode = !editMode
  const { signer } = useProtocol()
  const [udtRewards, setUdtRewards] = useState<Array<{ token?: UDTToken; amount: string }>>([])
  const [isEditingRewards, setIsEditingRewards] = useState(false)

  // Safe decimal string -> bigint converter with fixed decimals
  const parseAmountToUnits = (amountStr: string | undefined, decimals: number): bigint => {
    if (!amountStr) return 0n
    const s = amountStr.trim()
    if (!s) return 0n
    // allow digits with optional single dot
    if (!/^\d*(?:\.\d*)?$/.test(s)) return 0n
    const [ints, fracs = ""] = s.split(".")
    const fracPadded = (fracs + "0".repeat(decimals)).slice(0, decimals)
    const base = 10n ** BigInt(decimals)
    try {
      const intPart = ints ? BigInt(ints) : 0n
      const fracPart = fracPadded ? BigInt(fracPadded) : 0n
      return intPart * base + fracPart
    } catch {
      return 0n
    }
  }

  const toUDTAsset = (token: UDTToken, amountStr: string): { udt_script: ccc.ScriptLike; amount: bigint } | null => {
    const raw = parseAmountToUnits(amountStr, token.decimals)
    if (raw <= 0n) return null
    return {
      udt_script: {
        codeHash: token.script.codeHash,
        hashType: token.script.hashType,
        args: token.script.args
      },
      amount: raw
    }
  }

  const handleAddSubtask = () => {
    onQuestFormChange({
      ...questForm,
      sub_tasks: [
        ...questForm.sub_tasks,
        {
          id: questForm.sub_tasks.length + 1,
          title: "",
          description: "",
          type: "technical",
          proof_required: ""
        }
      ],
      initial_quota: 10
    })
  }

  const handleAddTestSubtask = () => {
    const subtaskRandom = Math.floor(Math.random() * 1000)
    onQuestFormChange({
      ...questForm,
      sub_tasks: [
        ...questForm.sub_tasks,
        {
          id: questForm.sub_tasks.length + 1,
          title: `Sample Subtask ${subtaskRandom}`,
          description: `Complete this technical task to progress ${subtaskRandom}`,
          type: "technical",
          proof_required: "Screenshot or link to completed work"
        }
      ],
      initial_quota: 10
    })
  }

  const handleRemoveSubtask = (index: number) => {
    onQuestFormChange({
      ...questForm,
      sub_tasks: questForm.sub_tasks.filter((_, i) => i !== index),
      initial_quota: 10
    })
  }

  const handleSubtaskChange = (index: number, field: keyof QuestSubTaskDataLike, value: unknown) => {
    const newSubtasks = [...questForm.sub_tasks]
    newSubtasks[index] = { ...newSubtasks[index], [field]: value }
    onQuestFormChange({ ...questForm, sub_tasks: newSubtasks })
  }

  // Initialize UDT/CKB rewards from questForm when dialog opens
  useEffect(() => {
    // Don't re-initialize if we're actively editing rewards
    if (isEditingRewards) return

    if (open && questForm.rewards_on_completion[0]) {
      const base = questForm.rewards_on_completion[0]

      // Map UDT assets
      const rewardsFromUdts = (base.udt_assets || []).map(asset => {
        const token = udtRegistry.getTokenByScriptHash(
          ccc.Script.from(asset.udt_script).hash()
        )
        return {
          token,
          amount: token ? udtRegistry.formatAmount(Number(asset.amount), token) : asset.amount.toString()
        }
      })

      // Map CKB amount (if any) as a pseudo token
      const rewards: Array<{ token?: UDTToken; amount: string }> = [...rewardsFromUdts]
      const ckbAmount = Number(base.ckb_amount || 0)
      if (!isNaN(ckbAmount) && ckbAmount > 0) {
        const net = (process.env.NEXT_PUBLIC_CKB_NETWORK === 'testnet' ? 'testnet' : 'mainnet') as 'testnet' | 'mainnet'
        const ckbToken: UDTToken = {
          network: net,
          symbol: 'CKB',
          name: 'CKB (native)',
          decimals: 8,
          script: { codeHash: '0x' as ccc.Hex, hashType: 'type' as ccc.HashType, args: '0x' as ccc.Hex },
          contractScript: { codeHash: '0x', hashType: 'type', args: '0x' }
        }
        const ckbFormatted = (ckbAmount / (10 ** 8)).toString()
        rewards.push({ token: ckbToken, amount: ckbFormatted })
      }

      setUdtRewards(rewards)
    } else if (open && !isEditingRewards) {
      setUdtRewards([])
    }
  }, [open, questForm.rewards_on_completion, isEditingRewards])
  
  // Reset editing flag when dialog closes
  useEffect(() => {
    if (!open) {
      setIsEditingRewards(false)
    }
  }, [open])

  const handleAddUDTReward = () => {
    console.log("Adding UDT reward, current count:", udtRewards.length)
    setIsEditingRewards(true)
    const newRewards = [...udtRewards, { amount: "" }]
    setUdtRewards(newRewards)
    
    // Update questForm to ensure rewards_on_completion exists
    if (questForm.rewards_on_completion.length === 0) {
      onQuestFormChange({
        ...questForm,
        rewards_on_completion: [{
          points_amount: 0,
          ckb_amount: 0,
          nft_assets: [],
          udt_assets: []
        }],
      })
    }
  }

  const handleRemoveUDTReward = (index: number) => {
    setIsEditingRewards(true)
    const newRewards = udtRewards.filter((_, i) => i !== index)
    setUdtRewards(newRewards)
    
    // Update questForm immediately when removing rewards (handle UDT and CKB)
    const ckbReward = newRewards.find(r => r.token?.symbol === 'CKB')
    const ckbAmount = ckbReward ? parseAmountToUnits(ckbReward.amount, 8) : 0n
    const udtAssets = newRewards
      .filter(r => r.token && r.token.symbol !== 'CKB')
      .map(r => (r.token ? toUDTAsset(r.token, r.amount) : null))
      .filter((a): a is { udt_script: ccc.ScriptLike; amount: bigint } => !!a)
    
    const updatedRewards = [...questForm.rewards_on_completion]
    if (updatedRewards[0]) {
      updatedRewards[0] = {
        ...updatedRewards[0],
        udt_assets: udtAssets,
        ckb_amount: ckbAmount
      }
    }
    
    onQuestFormChange({
      ...questForm,
      rewards_on_completion: updatedRewards,
      initial_quota: 10
    })
  }

  const handleUDTRewardChange = (index: number, value: { token?: UDTToken; amount: string }) => {
    setIsEditingRewards(true)
    const newRewards = [...udtRewards]
    newRewards[index] = value
    setUdtRewards(newRewards)
    
    // Update questForm immediately when user changes rewards (handle UDT and CKB)
    const ckbReward = newRewards.find(r => r.token?.symbol === 'CKB')
    const ckbAmount = ckbReward ? parseAmountToUnits(ckbReward.amount, 8) : 0n
    const udtAssets = newRewards
      .filter(r => r.token && r.token.symbol !== 'CKB')
      .map(r => (r.token ? toUDTAsset(r.token, r.amount) : null))
      .filter((a): a is { udt_script: ccc.ScriptLike; amount: bigint } => !!a)
    
    const updatedRewards = [...questForm.rewards_on_completion]
    if (updatedRewards.length === 0 && udtAssets.length > 0) {
      updatedRewards.push({
        points_amount: 0,
        ckb_amount: ckbAmount,
        nft_assets: [],
        udt_assets: udtAssets
      })
    } else if (updatedRewards[0]) {
      updatedRewards[0] = {
        ...updatedRewards[0],
        udt_assets: udtAssets,
        ckb_amount: ckbAmount
      }
    }
    
    onQuestFormChange({
      ...questForm,
      rewards_on_completion: updatedRewards,
      initial_quota: 10
    })
  }

  const handleFillTestQuest = () => {
    const questRandom = Math.floor(Math.random() * 1000)
    onQuestFormChange({
      quest_id: localQuestsLength + 1,
      metadata: {
        title: `Write Your First Smart Contract ${questRandom}`,
        short_description: `Create a simple smart contract in Rust ${questRandom}`,
        long_description: "Learn the basics of smart contract development on CKB by writing a simple contract that demonstrates basic functionality",
        requirements: "Rust programming knowledge, completed environment setup",
        difficulty: 2,
        time_estimate: 120
      },
      points: 1000,
      rewards_on_completion: [],
      accepted_submission_user_type_ids: [],
      completion_deadline: BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60),
      status: 0,
      sub_tasks: [
        {
          id: 1,
          title: "Create Contract Project",
          description: "Initialize a new Rust project for your smart contract",
          type: "technical",
          proof_required: "GitHub repository link"
        },
        {
          id: 2,
          title: "Implement Contract Logic",
          description: "Write the main contract logic following CKB patterns",
          type: "technical",
          proof_required: "Code snippet of main function"
        }
      ],
      completion_count: 0,
      initial_quota: 10
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editMode ? "Edit Quest" : "Add New Quest"}</DialogTitle>
          <DialogDescription>
            Define quest details and rewards for participants
          </DialogDescription>
          {isCreateMode && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={handleFillTestQuest}
            >
              <Sparkles className="w-4 h-4 mr-1" />
              Fill Test Quest
            </Button>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {/* Basic Information */}
          <div>
            <Label htmlFor="questTitle">Title</Label>
            <Input
              id="questTitle"
              value={questForm.metadata?.title || ""}
              onChange={(e) => onQuestFormChange({ 
                ...questForm, 
                metadata: { 
                  ...questForm.metadata, 
                  title: e.target.value 
                },
              })}
              placeholder="Enter quest title"
            />
          </div>

          <div>
            <Label htmlFor="questShortDesc">Short Description</Label>
            <Textarea
              id="questShortDesc"
              rows={2}
              value={questForm.metadata?.short_description || ""}
              onChange={(e) => onQuestFormChange({ 
                ...questForm, 
                metadata: { 
                  ...questForm.metadata, 
                  short_description: e.target.value 
                },
              })}
              placeholder="Brief description for quest cards"
            />
          </div>

          <div>
            <Label htmlFor="questLongDesc">Long Description</Label>
            <Textarea
              id="questLongDesc"
              rows={4}
              value={questForm.metadata?.long_description || ""}
              onChange={(e) => onQuestFormChange({ 
                ...questForm, 
                metadata: { 
                  ...questForm.metadata, 
                  long_description: e.target.value 
                },
              })}
              placeholder="Detailed instructions and requirements"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="questPoints">Points</Label>
              <Input
                id="questPoints"
                type="number"
                value={Number(questForm.points) || 0}
                onChange={(e) => onQuestFormChange({ ...questForm, points: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label htmlFor="questDifficulty">Difficulty</Label>
              <select
                id="questDifficulty"
                className="w-full p-2 border rounded-md"
                value={Number(questForm.metadata?.difficulty) || 1}
                onChange={(e) => onQuestFormChange({ 
                  ...questForm, 
                  metadata: { 
                    ...questForm.metadata, 
                    difficulty: parseInt(e.target.value) 
                  },
                })}
              >
                <option value={1}>Easy</option>
                <option value={2}>Medium</option>
                <option value={3}>Hard</option>
              </select>
            </div>
            <div>
              <Label htmlFor="questTime">Time (mins)</Label>
              <Input
                id="questTime"
                type="number"
                value={Number(questForm.metadata?.time_estimate) || 30}
                onChange={(e) => onQuestFormChange({ 
                  ...questForm, 
                  metadata: { 
                    ...questForm.metadata, 
                    time_estimate: parseInt(e.target.value) || 30 
                  },
                })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="questRequirements">Requirements</Label>
            <Textarea
              id="questRequirements"
              rows={3}
              value={questForm.metadata?.requirements || ""}
              onChange={(e) => onQuestFormChange({ 
                ...questForm, 
                metadata: { 
                  ...questForm.metadata, 
                  requirements: e.target.value 
                },
              })}
              placeholder="What participants need to complete this quest"
            />
          </div>

          {/* Rewards Configuration */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Rewards</Label>
                <p className="text-xs text-muted-foreground mt-1">Configure CKB and UDT tokens to distribute as quest rewards</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddUDTReward}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Reward
              </Button>
            </div>
            
            {udtRewards.length > 0 && (
              <div className="space-y-3">
                {udtRewards.map((reward, index) => (
                  <Card key={index} className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Reward #{index + 1}</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveUDTReward(index)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                      
                      <UDTSelector
                        value={reward}
                        onChange={(value) => handleUDTRewardChange(index, value)}
                        signer={signer}
                        showBalance={true}
                        label="Asset and Amount"
                        placeholder="Enter amount per completion"
                        includeCKB={true}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            )}
            
            {udtRewards.length > 0 && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="initialQuota">Initial Quota</Label>
                  <Input
                    id="initialQuota"
                    type="number"
                    min="1"
                    step="1"
                    value={Number(questForm.initial_quota) || 10}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 10
                      // Only allow positive integers, default to 10
                      const sanitizedValue = Math.max(1, Math.floor(value))
                      onQuestFormChange({ ...questForm, initial_quota: sanitizedValue })
                    }}
                    placeholder="Enter initial quota (minimum 1, default 10)"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    The initial quota of reward completions (minimum 1, default 10). Can be further funded.
                  </p>
                </div>
                
                {setLockUDTOnSave && (
                  <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
                    <Checkbox
                      id="lockUDT"
                      checked={lockUDTOnSave}
                      onCheckedChange={(checked) => setLockUDTOnSave(!!checked)}
                    />
                    <div className="flex-1">
                      <Label htmlFor="lockUDT" className="flex items-center gap-2 cursor-pointer">
                        <Lock className="w-4 h-4" />
                        Lock UDT to campaign on save
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Automatically lock the required UDT tokens to this campaign when saving.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Subtasks Management */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Subtasks</Label>
              <div className="flex gap-2">
                {isCreateMode && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddTestSubtask}
                  >
                    <Sparkles className="w-4 h-4 mr-1" />
                    Test Subtask
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddSubtask}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Subtask
                </Button>
              </div>
            </div>
            
            {questForm.sub_tasks.length === 0 ? (
              <div className="text-center py-4 border rounded-lg text-sm text-muted-foreground">
                No subtasks added yet. Add subtasks to break down the quest into steps.
              </div>
            ) : (
              <div className="space-y-3">
                {questForm.sub_tasks.map((subtask: QuestSubTaskDataLike, index: number) => (
                  <Card key={index} className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium">Subtask {index + 1}</h4>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveSubtask(index)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Title</Label>
                          <Input
                            value={subtask.title}
                            onChange={(e) => handleSubtaskChange(index, 'title', e.target.value)}
                            placeholder="e.g., Setup environment"
                          />
                        </div>
                        
                        <div>
                          <Label>Type</Label>
                          <select
                            className="w-full p-2 border rounded-md"
                            value={subtask.type}
                            onChange={(e) => handleSubtaskChange(index, 'type', e.target.value)}
                          >
                            <option value="technical">Technical</option>
                            <option value="social">Social</option>
                            <option value="content">Content</option>
                            <option value="research">Research</option>
                            <option value="onchain">On-chain</option>
                          </select>
                        </div>
                      </div>
                      
                      <div>
                        <Label>Description</Label>
                        <Textarea
                          rows={2}
                          value={subtask.description}
                          onChange={(e) => handleSubtaskChange(index, 'description', e.target.value)}
                          placeholder="Detailed instructions..."
                        />
                      </div>
                      
                      <div>
                        <Label>Proof Required</Label>
                        <Input
                          value={subtask.proof_required}
                          onChange={(e) => handleSubtaskChange(index, 'proof_required', e.target.value)}
                          placeholder="e.g., Screenshot, GitHub link"
                        />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave}>
            {editMode ? "Save Quest" : "Add Quest"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
