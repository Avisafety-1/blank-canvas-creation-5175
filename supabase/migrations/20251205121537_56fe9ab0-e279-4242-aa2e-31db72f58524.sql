-- Add flyvetimer column to profiles table for manual flight hour tracking
ALTER TABLE public.profiles ADD COLUMN flyvetimer numeric DEFAULT 0;