import { useState, useEffect, useCallback } from "react";
import { Send, Trash2 } from "lucide-react";
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
  profiles: { username: string; avatar_url: string | null } | null;
}

export default function CommentSection({ clipId, clipOwnerId }: { clipId: string; clipOwnerId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchComments = useCallback(async () => {
    const { data, error } = await supabase
      .from("comments")
      .select("id, content, created_at, user_id, profiles!inner(username, avatar_url)")
      .eq("clip_id", clipId)
      .order("created_at", { ascending: true })
      .limit(100);
    if (!error && data) setComments(data as unknown as Comment[]);
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

  const handleSend = async () => {
    if (!user) { navigate("/auth"); return; }
    
    const result = commentSchema.safeParse({ content: text });
    if (!result.success) {
      toast({ title: result.error.errors[0]?.message || "Invalid comment", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.from("comments").insert({
        clip_id: clipId,
        user_id: user.id,
        content: result.data.content,
      });

      if (error) throw error;
      setText("");

      // Create notification for clip owner (if not self)
      if (clipOwnerId && clipOwnerId !== user.id) {
        try {
          await supabase.from("notifications").insert({
            user_id: clipOwnerId,
            type: "comment",
            message: `@${profile?.username || "someone"} commented on your clip 💬`,
            reference_id: clipId,
          });
        } catch {
          // Don't fail the comment if notification fails
        }
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-3 px-4 py-3">
        {comments.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-6">No comments yet. Be the first! 💬</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex items-start gap-2.5">
            <Avatar className="w-7 h-7 mt-0.5 border border-border">
              <AvatarImage src={c.profiles?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-secondary text-xs">{c.profiles?.username?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">@{c.profiles?.username ?? "fan"}</span>
                <span className="text-xs text-muted-foreground">{timeAgo(c.created_at)}</span>
              </div>
              <p className="text-sm text-foreground/90 break-words">{c.content}</p>
            </div>
            {user?.id === c.user_id && (
              <button onClick={() => handleDelete(c.id)} className="text-muted-foreground hover:text-destructive p-1">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-card">
        <Input
          placeholder={user ? "Add a comment..." : "Sign in to comment"}
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
  );
}
