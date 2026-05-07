CREATE TABLE public.notam_rss_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  feed_url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notam_rss_feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage notam_rss_feeds"
  ON public.notam_rss_feeds
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin')
  );

-- Service role needs access for edge function
CREATE POLICY "Service role full access notam_rss_feeds"
  ON public.notam_rss_feeds
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO public.notam_rss_feeds (name, feed_url) VALUES
  ('Sør-Norge (Avisafe)', 'https://notaminfo.com/feed?u=Avisafe');