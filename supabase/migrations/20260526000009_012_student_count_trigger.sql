-- =====================================================================
-- 012: student count trigger
-- Keeps schools.current_students accurate without client-side math.
-- Uses AFTER trigger + SECURITY DEFINER so it can UPDATE schools
-- regardless of the caller's RLS context.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.update_student_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.schools
    SET current_students = current_students + 1,
        updated_at = NOW()
    WHERE id = NEW.school_id;

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.schools
    SET current_students = GREATEST(current_students - 1, 0),
        updated_at = NOW()
    WHERE id = OLD.school_id;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle class transfers (school_id change is not allowed, but status change
    -- from active → withdrawn/graduated should decrement)
    IF OLD.status = 'active' AND NEW.status IN ('withdrawn', 'graduated') THEN
      UPDATE public.schools
      SET current_students = GREATEST(current_students - 1, 0),
          updated_at = NOW()
      WHERE id = NEW.school_id;
    ELSIF NEW.status = 'active' AND OLD.status IN ('withdrawn', 'graduated') THEN
      UPDATE public.schools
      SET current_students = current_students + 1,
          updated_at = NOW()
      WHERE id = NEW.school_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_student_change ON public.students;
CREATE TRIGGER on_student_change
  AFTER INSERT OR DELETE OR UPDATE OF status
  ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.update_student_count();
