
DROP POLICY IF EXISTS "Anon can insert clips for testing" ON public.clips;

DO $$
BEGIN
  -- Remove anon storage policy if it exists
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon can upload clips for testing' AND tablename = 'objects' AND schemaname = 'storage') THEN
    DROP POLICY "Anon can upload clips for testing" ON storage.objects;
  END IF;
END $$;

-- Update existing null user_id rows to a placeholder before adding NOT NULL
-- (skip if no null rows exist)
DELETE FROM public.clips WHERE user_id IS NULL;

ALTER TABLE public.clips ALTER COLUMN user_id SET NOT NULL;
