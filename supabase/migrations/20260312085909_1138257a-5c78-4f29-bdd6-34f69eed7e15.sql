
-- Allow anonymous uploads to clips storage bucket for testing
CREATE POLICY "Anon can upload clips for testing"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'clips');

-- Allow anonymous inserts to clips table for testing
CREATE POLICY "Anon can insert clips for testing"
ON public.clips FOR INSERT
TO anon
WITH CHECK (true);
