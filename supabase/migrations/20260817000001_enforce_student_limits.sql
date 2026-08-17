-- 20260817000001_enforce_student_limits.sql
-- Enforces strict student capacity limits based on the school's active tier.
-- Uses schools.max_students as the single source of truth (set by upgrade_school_tier RPC).
-- Only counts the relational students table to avoid double-counting JSON blobs.

CREATE OR REPLACE FUNCTION public.check_student_capacity_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _max_students INT;
    _rel_count    INT;
BEGIN
    -- 1. Get the max_students for the school from the schools table.
    --    upgrade_school_tier() always keeps this in sync with the billing plan.
    SELECT max_students INTO _max_students
    FROM public.schools
    WHERE id = NEW.school_id;

    -- Fallback to 200 if not found (Micro plan default)
    IF _max_students IS NULL THEN
        _max_students := 200;
    END IF;

    -- 2. Count only active relational students for this school.
    --    We exclude 'graduated' and 'withdrawn' so they don't consume capacity.
    SELECT COUNT(*) INTO _rel_count
    FROM public.students
    WHERE school_id = NEW.school_id
      AND status = 'active';

    -- 3. Enforce limit before the new row is inserted
    IF _rel_count >= _max_students THEN
        RAISE EXCEPTION 'Tier capacity exceeded. You have reached your limit of % active students. Please upgrade your plan to add more.', _max_students;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_student_capacity ON public.students;
CREATE TRIGGER enforce_student_capacity
BEFORE INSERT ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.check_student_capacity_before_insert();
