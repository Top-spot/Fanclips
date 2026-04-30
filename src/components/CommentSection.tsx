import { useState, useEffect, useCallback, useMemo } from "react";
import { Send, Trash2, CornerDownRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { commentSchema } from "@/lib/validation";

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  parent_comment_id: string | null;
  profiles: { username: string; avatar_url: string | null } | null;
}

export default function CommentSection({ clipId, clipOwnerId }: { clipId: string; clipOwnerId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchComments = useCallback(async () => {
    let { data, error } = await supabase
      .from("comments")
      .select("id, content, created_at, user_id, parent_comment_id")
      .eq("clip_id", clipId)
      .order("created_at", { ascending: true })
      .limit(300);
    if (error && error.message.toLowerCase().includes("parent_comment_id")) {
      const fallback = await supabase
        .from("comments")
        .select("id, content, created_at, user_id")
        .eq("clip_id", clipId)
        .order("created_at", { ascending: true })
        .limit(300);
      data = fallback.data?.map((row) => ({ ...row, parent_comment_id: null })) as typeof data;
      error = fallback.error as typeof error;
    }
    if (error || !data) return;

    const rows = data as Array<{
      id: string;
      content: string;
      created_at: string;
      user_id: string;
      parent_comment_id: string | null;
    }>;
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const profileMap = new Map<string, { username: string; avatar_url: string | null }>();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, username, avatar_url")
        .in("user_id", userIds);
      profiles?.forEach((p) => {
        profileMap.set(p.user_id, { username: p.username, avatar_url: p.avatar_url });
      });
    }

    setComments(
      rows.map((r) => ({
        ...r,
        profiles: profileMap.get(r.user_id) ?? null,
      }))
    );
  }, [clipId]);

  useEffect(() => {
    fetchComments();
    const channel = supabase
      .channel(`comments-${clipId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `clip_id=eq.${clipId}` }, () => {
        fetchComments();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clipId, fetchComments]);

  const commentsByParent = useMemo(() => {
    const map = new Map<string | null, Comment[]>();
    comments.forEach((c) => {
      const key = c.parent_comment_id;
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

    setSending(true);
    try {
      const payload: Record<string, unknown> = {
        clip_id: clipId,
        user_id: user.id,
        content: result.data.content,
      };
      if (replyTo) payload.parent_comment_id = replyTo;

      let { error } = await supabase.from("comments").insert(payload);
      if (error && payload.parent_comment_id && error.message.toLowerCase().includes("parent_comment_id")) {
        delete payload.parent_comment_id;
        const fallback = await supabase.from("comments").insert(payload);
        error = fallback.error;
        if (!error) {
          toast({
            title: "Reply posted as comment",
            description: "Apply the latest migration to enable nested replies.",
          });
        }
      }
      if (error) throw error;

      const parent = replyTo ? comments.find((c) => c.id === replyTo) : null;
      setText("");
      setReplyTo(null);

      // Create notification for clip owner (if not self)
      if (clipOwnerId && clipOwnerId !== user.id) {
        await supabase.from("notifications").insert({
          user_id: clipOwnerId,
          type: "comment",
          message: `@${profile?.username || "someone"} commented on your clip 💬`,
          reference_id: clipId,
        });
      }
      if (parent && parent.user_id !== user.id && parent.user_id !== clipOwnerId) {
        await supabase.from("notifications").insert({
          user_id: parent.user_id,
          type: "comment",
          message: `@${profile?.username || "someone"} replied to your comment ↩️`,
          reference_id: clipId,
        });
      }
    } catch {
      toast({ title: "Failed to post comment", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
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
    return (
      <div key={c.id} className={depth > 0 ? "ml-5 mt-2" : ""}>
        <div className="flex items-start gap-2.5">
          <Avatar className="w-7 h-7 mt-0.5 border border-border">
            <AvatarImage src={c.profiles?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-secondary text-xs">{c.profiles?.username?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-foreground">@{c.profiles?.username ?? "fan"}</span>
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
            <p className="text-sm text-foreground/90 break-words">{c.content}</p>
          </div>
          {user?.id === c.user_id && (
            <button onClick={() => handleDelete(c.id)} className="text-muted-foreground hover:text-destructive p-1">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {children.length > 0 && <div className="mt-1 space-y-1">{children.map((child) => renderComment(child, depth + 1))}</div>}
      </div>
    );
  };

  const topLevel = commentsByParent.get(null) ?? [];
  const replyTarget = replyTo ? comments.find((c) => c.id === replyTo) : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 px-4 py-3 pb-2">
        {topLevel.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-6">No comments yet. Be the first! 💬</p>
        )}
        {topLevel.map((c) => renderComment(c))}
      </div>
      <div className="sticky bottom-0 z-10 px-4 pt-2 pb-3 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
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
