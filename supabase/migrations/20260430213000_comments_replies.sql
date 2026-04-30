-- Threaded comments: allow replying to comments.

ALTER TABLE public.comments
ADD COLUMN IF NOT EXISTS parent_comment_id uuid NULL REFERENCES public.comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id ON public.comments(parent_comment_id);

COMMENT ON COLUMN public.comments.parent_comment_id IS
'Nullable self-reference for threaded replies. NULL = top-level comment.';
