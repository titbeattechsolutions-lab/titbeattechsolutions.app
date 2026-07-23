-- Drop the existing auto-generated check constraint on the status column
ALTER TABLE public.students 
  DROP CONSTRAINT IF EXISTS students_status_check;

-- Add the new constraint allowing 'suspended'
ALTER TABLE public.students
  ADD CONSTRAINT students_status_check 
  CHECK (status IN ('active', 'graduated', 'withdrawn', 'suspended'));
