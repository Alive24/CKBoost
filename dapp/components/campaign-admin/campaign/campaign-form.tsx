"use client";

import React from "react";
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Plus } from "lucide-react"

interface CampaignFormData {
  title: string
  shortDescription: string
  longDescription: string
  categories: string[]
  startDate: string
  endDate: string
  difficulty: number
  verificationLevel: string
  rules: string[]
}

interface CampaignFormProps {
  campaignData: CampaignFormData
  onChange: (data: CampaignFormData) => void
  isCreateMode: boolean
}

export function CampaignForm({ campaignData, onChange, isCreateMode }: CampaignFormProps) {
  const handleChange = (field: keyof CampaignFormData, value: unknown) => {
    onChange({
      ...campaignData,
      [field]: value
    })
  }

  const handleAddCategory = () => {
    const category = prompt("Enter category name:")
    if (category) {
      handleChange('categories', [...campaignData.categories, category])
    }
  }

  const handleRemoveCategory = (index: number) => {
    handleChange('categories', campaignData.categories.filter((_, i) => i !== index))
  }

  const handleAddRule = () => {
    handleChange('rules', [...campaignData.rules, ""])
  }

  const handleRuleChange = (index: number, value: string) => {
    const newRules = [...campaignData.rules]
    newRules[index] = value
    handleChange('rules', newRules)
  }

  const handleRemoveRule = (index: number) => {
    handleChange('rules', campaignData.rules.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-6">
      {/* Basic Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Basic Information</h3>
        
        <div>
          <Label htmlFor="title">Campaign Title</Label>
          <Input
            id="title"
            value={campaignData.title}
            onChange={(e) => handleChange('title', e.target.value)}
            placeholder="Enter campaign title"
          />
        </div>

        <div>
          <Label htmlFor="shortDescription">Short Description</Label>
          <Textarea
            id="shortDescription"
            rows={2}
            value={campaignData.shortDescription}
            onChange={(e) => handleChange('shortDescription', e.target.value)}
            placeholder="Brief description for campaign cards"
          />
        </div>

        <div>
          <Label htmlFor="longDescription">Long Description</Label>
          <Textarea
            id="longDescription"
            rows={5}
            value={campaignData.longDescription}
            onChange={(e) => handleChange('longDescription', e.target.value)}
            placeholder="Detailed campaign description and instructions"
          />
        </div>

        <div>
          <Label>Categories</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {campaignData.categories.map((category, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => handleRemoveCategory(index)}
              >
                {category} ×
              </Badge>
            ))}
            <button
              onClick={handleAddCategory}
              className="px-2 py-1 border border-dashed rounded-md text-sm hover:bg-muted"
            >
              <Plus className="w-3 h-3 inline mr-1" />
              Add Category
            </button>
          </div>
        </div>
      </div>

      {/* Campaign Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Campaign Settings</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="startDate">Start Date</Label>
            <Input
              id="startDate"
              type="datetime-local"
              value={campaignData.startDate}
              onChange={(e) => handleChange('startDate', e.target.value)}
            />
          </div>
          
          <div>
            <Label htmlFor="endDate">End Date</Label>
            <Input
              id="endDate"
              type="datetime-local"
              value={campaignData.endDate}
              onChange={(e) => handleChange('endDate', e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="difficulty">Difficulty Level</Label>
            <select
              id="difficulty"
              className="w-full p-2 border rounded-md"
              value={campaignData.difficulty}
              onChange={(e) => handleChange('difficulty', parseInt(e.target.value))}
            >
              <option value={0}>Beginner</option>
              <option value={1}>Intermediate</option>
              <option value={2}>Advanced</option>
            </select>
          </div>
          
          <div>
            <Label htmlFor="verificationLevel">Verification Level</Label>
            <select
              id="verificationLevel"
              className="w-full p-2 border rounded-md"
              value={campaignData.verificationLevel}
              onChange={(e) => handleChange('verificationLevel', e.target.value)}
            >
              <option value="none">None</option>
              <option value="telegram">Telegram</option>
              <option value="twitter">Twitter</option>
              <option value="discord">Discord</option>
              <option value="manual">Manual Review</option>
            </select>
          </div>
        </div>
      </div>

      {/* Campaign Rules */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Campaign Rules</h3>
          <button
            onClick={handleAddRule}
            className="text-sm text-primary hover:underline"
          >
            <Plus className="w-4 h-4 inline mr-1" />
            Add Rule
          </button>
        </div>
        
        <div className="space-y-2">
          {campaignData.rules.map((rule, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={rule}
                onChange={(e) => handleRuleChange(index, e.target.value)}
                placeholder={`Rule ${index + 1}`}
              />
              <button
                onClick={() => handleRemoveRule(index)}
                className="px-3 py-1 text-sm text-destructive hover:bg-destructive/10 rounded"
              >
                Remove
              </button>
            </div>
          ))}
          {campaignData.rules.length === 0 && (
            <p className="text-sm text-muted-foreground">No rules added yet</p>
          )}
        </div>
      </div>
    </div>
  )
}