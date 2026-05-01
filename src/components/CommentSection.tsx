import { useState, useEffect, useCallback, useMemo } from "react";
import { Send, Trash2, CornerDownRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { commentIdSchema, commentSchema } from "@/lib/validation";
import {
  createComment,
  deleteComment,
  listCommentProfiles,
  listCommentsByClip,
} from "@/services/commentsService";

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  parent_comment_id: string | null;
  /** Parent comment author’s @username when this row is a reply */
  replyToUsername: string | null;
  profiles: { username: string; avatar_url: string | null } | null;
}

export default function CommentSection({ clipId }: { clipId: string; clipOwnerId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchComments = useCallback(async (withLoader = false) => {
    if (withLoader) setLoading(true);
    else setRefreshing(true);
    setLoadError(null);

    const commentsRes = await listCommentsByClip(clipId);
    if (commentsRes.error) {
      setLoadError("Could not load comments. Please retry.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const rows = commentsRes.data as Array<{
      id: string;
      content: string;
      created_at: string;
      user_id: string;
      parent_comment_id: string | null;
    }>;
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const profileMap = new Map<string, { username: string; avatar_url: string | null }>();

    if (userIds.length > 0) {
      const profilesRes = await listCommentProfiles(userIds);
      profilesRes.data?.forEach((p) => {
        profileMap.set(p.user_id, { username: p.username, avatar_url: p.avatar_url });
      });
    }

    const rowById = new Map(rows.map((r) => [r.id, r]));
    const replyToUsernameFor = (parentId: string | null): string | null => {
      if (!parentId) return null;
      const parent = rowById.get(parentId);
      if (!parent) return null;
      return profileMap.get(parent.user_id)?.username ?? null;
    };

    setComments(
      rows.map((r) => ({
        ...r,
        replyToUsername: replyToUsernameFor(r.parent_comment_id),
        profiles: profileMap.get(r.user_id) ?? null,
      }))
    );
    setLoading(false);
    setRefreshing(false);
  }, [clipId]);

  useEffect(() => {
    void fetchComments(true);
    const channel = supabase
      .channel(`comments-${clipId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `clip_id=eq.${clipId}` }, () => {
        void fetchComments(false);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clipId, fetchComments]);

  const commentsByParent = useMemo(() => {
    const ids = new Set(comments.map((c) => c.id));
    const map = new Map<string | null, Comment[]>();
    comments.forEach((c) => {
      const parentId = c.parent_comment_id;
      const key = parentId && ids.has(parentId) ? parentId : null;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    });
    return map;
  }, [comments]);

  const handleSend = async () => {
    if (!user) { navigate("/auth"); return; }
    
    const result = commentSchema.safeParse({ content: text });
    if (!result.success) {
      toast({ title: result.error.errors[0]?.message || "Invalid comment", variant: "destructive" });
      return;
    }

    const replyingToId = replyTo;
    const parentAuthor = replyingToId
      ? comments.find((c) => c.id === replyingToId)?.profiles?.username ?? null
      : null;

    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticComment: Comment = {
      id: optimisticId,
      content: result.data.content,
      created_at: new Date().toISOString(),
      user_id: user.id,
      parent_comment_id: replyingToId,
      replyToUsername: parentAuthor,
      profiles: {
        username: user.user_metadata?.username ?? "you",
        avatar_url: user.user_metadata?.avatar_url ?? null,
      },
    };
    setComments((prev) => [...prev, optimisticComment]);
    setText("");
    setReplyTo(null);
    setSending(true);
    try {
      const parentCommentId =
        replyingToId &&
        commentIdSchema.safeParse(replyingToId).success &&
        comments.some((c) => c.id === replyingToId)
          ? replyingToId
          : undefined;
      const created = await createComment({
        clip_id: clipId,
        user_id: user.id,
        content: result.data.content,
        parent_comment_id: parentCommentId,
      });
      if (created.error) {
        if (replyingToId && created.error.toLowerCase().includes("parent_comment_id")) {
          toast({
            title: "Reply posted as comment",
            description: "Apply the latest migration to enable nested replies.",
          });
        }
        throw new Error(created.error);
      }

      await fetchComments(false);
      toast({ title: "Comment posted", description: "Interaction points were applied." });
    } catch {
      setComments((prev) => prev.filter((comment) => comment.id !== optimisticId));
      toast({ title: "Failed to post comment", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    const previous = comments;
    setComments((prev) => prev.filter((comment) => comment.id !== id && comment.parent_comment_id !== id));
    const deleted = await deleteComment(id);
    if (deleted.error) {
      setComments(previous);
      toast({ title: "Failed to delete", variant: "destructive" });
      return;
    }
    await fetchComments(false);
  };

  const timeAgo = (d: string) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return "now";
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  };

  const renderComment = (c: Comment, depth = 0): JSX.Element => {
    const children = commentsByParent.get(c.id) ?? [];
    const sortedChildren = [...children].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    return (
      <div key={c.id} className={depth > 0 ? "ml-4 pl-3 border-l border-border/60 mt-2" : ""}>
        <div className="flex items-start gap-2.5">
          <Avatar className="w-7 h-7 mt-0.5 border border-border">
            <AvatarImage src={c.profiles?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-secondary text-xs">{c.profiles?.username?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-foreground">@{c.profiles?.username ?? "fan"}</span>
              {c.replyToUsername && (
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5">
                  <CornerDownRight className="w-3 h-3 shrink-0 text-electric" aria-hidden />
                  <span>
                    replying to <span className="font-semibold text-foreground">@{c.replyToUsername}</span>
                  </span>
                </span>
              )}
              <span className="text-xs text-muted-foreground">{timeAgo(c.created_at)}</span>
              {user && (
                <button
                  type="button"
                  onClick={() => setReplyTo(c.id)}
                  className="text-[11px] text-electric font-semibold inline-flex items-center gap-1"
                >
                  <CornerDownRight className="w-3 h-3" />
                  Reply
                </button>
              )}
            </div>
            <p className="text-sm text-foreground/90 break-words mt-0.5">{c.content}</p>
          </div>
          {user?.id === c.user_id && (
            <button onClick={() => handleDelete(c.id)} className="text-muted-foreground hover:text-destructive p-1">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {sortedChildren.length > 0 && (
          <div className="mt-2 space-y-1">{sortedChildren.map((child) => renderComment(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  const topLevel = commentsByParent.get(null) ?? [];
  const replyTarget = replyTo ? comments.find((c) => c.id === replyTo) : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 px-4 py-3 pb-2">
        {loading && <p className="text-muted-foreground text-sm text-center py-6">Loading comments...</p>}
        {loadError && !loading && (
          <div className="text-center py-6">
            <p className="text-sm text-destructive mb-3">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void fetchComments(true)}>Retry</Button>
          </div>
        )}
        {!loading && !loadError && topLevel.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-6">No comments yet. Be the first! 💬</p>
        )}
        {!loadError && topLevel.map((c) => renderComment(c))}
      </div>
      <div className="sticky bottom-0 z-10 px-4 pt-2 pb-3 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        {refreshing && !loading && !loadError && (
          <p className="text-[11px] text-muted-foreground mb-1">Updating...</p>
        )}
        {replyTarget && (
          <div className="mb-2 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Replying to @{replyTarget.profiles?.username ?? "fan"}</span>
            <button type="button" onClick={() => setReplyTo(null)} className="text-xs text-electric font-semibold">
              Cancel
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 pb-[max(env(safe-area-inset-bottom),0px)]">
          <Input
            placeholder={user ? (replyTo ? "Write a reply..." : "Add a comment...") : "Sign in to comment"}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={!user || sending}
            maxLength={500}
            className="bg-secondary/50 border-border h-10 text-sm"
          />
          <Button size="icon" onClick={handleSend} disabled={!text.trim() || sending} className="gradient-electric h-10 w-10 shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
