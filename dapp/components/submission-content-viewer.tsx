"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Copy, Eye, Code } from "lucide-react"
// TODO: Install react-markdown package for proper markdown rendering
// import ReactMarkdown from "react-markdown"

interface SubmissionContentViewerProps {
  content: string
  className?: string
}

export function SubmissionContentViewer({ content, className = "" }: SubmissionContentViewerProps) {
  const [activeTab, setActiveTab] = useState<"rendered" | "raw">("rendered")

  const copyToClipboard = () => {
    navigator.clipboard.writeText(content)
  }

  // Try to detect if content is JSON
  const isJSON = content.trim().startsWith('{') || content.trim().startsWith('[')
  
  // Format JSON if applicable
  const formattedContent = isJSON ? (() => {
    try {
      return JSON.stringify(JSON.parse(content), null, 2)
    } catch {
      return content
    }
  })() : content

  // Simple markdown-like rendering (basic formatting)
  const renderContent = (text: string) => {
    if (isJSON) {
      return (
        <pre className="p-4 bg-muted rounded-lg overflow-auto max-h-[400px] text-sm">
          <code>{formattedContent}</code>
        </pre>
      )
    }

    // Basic markdown-like formatting without the library
    const lines = text.split('\n')
    return (
      <div className="p-4 bg-muted rounded-lg overflow-auto max-h-[400px] space-y-2">
        {lines.map((line, index) => {
          // Headers
          if (line.startsWith('# ')) {
            return <h1 key={index} className="text-xl font-bold">{line.substring(2)}</h1>
          }
          if (line.startsWith('## ')) {
            return <h2 key={index} className="text-lg font-semibold">{line.substring(3)}</h2>
          }
          if (line.startsWith('### ')) {
            return <h3 key={index} className="text-base font-medium">{line.substring(4)}</h3>
          }
          
          // List items
          if (line.startsWith('- ') || line.startsWith('* ')) {
            return <li key={index} className="ml-4 list-disc">{line.substring(2)}</li>
          }
          
          // Links (basic)
          const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
          const processedLine = line.replace(linkRegex, '<a href="$2" target="_blank" class="text-blue-500 hover:underline">$1</a>')
          
          // Bold text
          const boldRegex = /\*\*([^*]+)\*\*/g
          const finalLine = processedLine.replace(boldRegex, '<strong>$1</strong>')
          
          // Regular paragraph
          if (line.trim()) {
            return <p key={index} className="text-sm" dangerouslySetInnerHTML={{ __html: finalLine }} />
          }
          
          // Empty line
          return <br key={index} />
        })}
      </div>
    )
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "rendered" | "raw")}>
        <div className="flex items-center justify-between">
          <TabsList className="grid w-[200px] grid-cols-2">
            <TabsTrigger value="rendered">
              <Eye className="w-3 h-3 mr-1" />
              Rendered
            </TabsTrigger>
            <TabsTrigger value="raw">
              <Code className="w-3 h-3 mr-1" />
              Raw
            </TabsTrigger>
          </TabsList>
          
          <Button
            variant="outline"
            size="sm"
            onClick={copyToClipboard}
            className="h-7"
          >
            <Copy className="w-3 h-3 mr-1" />
            Copy
          </Button>
        </div>

        <TabsContent value="rendered" className="mt-3">
          {renderContent(content)}
        </TabsContent>

        <TabsContent value="raw" className="mt-3">
          <Textarea
            value={formattedContent}
            readOnly
            className="min-h-[200px] max-h-[400px] font-mono text-sm"
            placeholder="No content available"
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}