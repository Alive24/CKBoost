"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Heart, MessageSquare, Share2, Send, MoreHorizontal } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface Comment {
  id: string
  author: string
  content: string
  timestamp: string
  likes: number
  isLiked: boolean
}

interface SocialInteractionsProps {
  proposalId: string
  initialLikes: number
  initialComments: Comment[]
  isLiked?: boolean
  onLike?: (proposalId: string) => void
  onComment?: (proposalId: string, comment: string) => void
  onShare?: (proposalId: string) => void
}

export function SocialInteractions({
  proposalId,
  initialLikes,
  initialComments,
  isLiked = false,
  onLike,
  onComment,
  onShare,
}: SocialInteractionsProps) {
  const [liked, setLiked] = useState(isLiked)
  const [likes, setLikes] = useState(initialLikes)
  const [comments, setComments] = useState(initialComments)
  const [showComments, setShowComments] = useState(false)
  const [newComment, setNewComment] = useState("")
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)

  const handleLike = () => {
    const newLikedState = !liked
    setLiked(newLikedState)
    setLikes((prev) => (newLikedState ? prev + 1 : prev - 1))
    onLike?.(proposalId)
  }

  const handleComment = async () => {
    if (!newComment.trim()) return

    setIsSubmittingComment(true)

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500))

    const comment: Comment = {
      id: Date.now().toString(),
      author: "CurrentUser",
      content: newComment,
      timestamp: "now",
      likes: 0,
      isLiked: false,
    }

    setComments((prev) => [comment, ...prev])
    setNewComment("")
    setIsSubmittingComment(false)
    onComment?.(proposalId, newComment)
  }

  const handleCommentLike = (commentId: string) => {
    setComments((prev) =>
      prev.map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              isLiked: !comment.isLiked,
              likes: comment.isLiked ? comment.likes - 1 : comment.likes + 1,
            }
          : comment,
      ),
    )
  }

  const handleShare = () => {
    // Copy link to clipboard
    navigator.clipboard.writeText(`${window.location.origin}/proposal/${proposalId}`)
    onShare?.(proposalId)
  }

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex items-center justify-between pt-2 border-t">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLike}
            className={`flex items-center gap-2 ${
              liked ? "text-red-600 hover:text-red-700" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Heart className={`w-4 h-4 ${liked ? "fill-current" : ""}`} />
            <span>{likes}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <MessageSquare className="w-4 h-4" />
            <span>{comments.length}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleShare}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <Share2 className="w-4 h-4" />
            <span>Share</span>
          </Button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Report content</DropdownMenuItem>
            <DropdownMenuItem>Copy link</DropdownMenuItem>
            <DropdownMenuItem>Save for later</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="space-y-4">
          <Separator />

          {/* Add Comment */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-gradient-to-br from-purple-200 to-blue-200 text-sm">U</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <Textarea
                  placeholder="Write a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={2}
                  className="resize-none"
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleComment} disabled={!newComment.trim() || isSubmittingComment}>
                    {isSubmittingComment ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                        Posting...
                      </>
                    ) : (
                      <>
                        <Send className="w-3 h-3 mr-2" />
                        Comment
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Comments List */}
          <div className="space-y-4">
            {comments.map((comment) => (
              <div key={comment.id} className="flex items-start gap-3">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-gradient-to-br from-green-200 to-blue-200 text-sm">
                    {comment.author.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <div className="bg-muted rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{comment.author}</span>
                      <span className="text-xs text-muted-foreground">{comment.timestamp}</span>
                    </div>
                    <p className="text-sm">{comment.content}</p>
                  </div>
                  <div className="flex items-center gap-2 px-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCommentLike(comment.id)}
                      className={`h-6 px-2 text-xs ${comment.isLiked ? "text-red-600" : "text-muted-foreground"}`}
                    >
                      <Heart className={`w-3 h-3 mr-1 ${comment.isLiked ? "fill-current" : ""}`} />
                      {comment.likes > 0 && comment.likes}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground">
                      Reply
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {comments.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No comments yet. Be the first to comment!</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
