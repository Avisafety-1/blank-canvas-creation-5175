-- Add påvirker_status column to personnel_competencies table
ALTER TABLE public.personnel_competencies 
ADD COLUMN påvirker_status boolean NOT NULL DEFAULT true;