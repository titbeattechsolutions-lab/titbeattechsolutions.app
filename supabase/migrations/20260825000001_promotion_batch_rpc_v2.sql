-- =====================================================================
-- MIGRATION: 20260825_promotion_batch_rpc_v2.sql
-- Bulk Promotion Engine — Enterprise Transaction Safety, Audit Snapshots,
-- Hardcoded Admin Authorization, Topological Execution Order, Automatic Class Resolution, and Rollback RPCs.
-- =====================================================================

-- 1. Create promotion_batches table for audit snapshots & historical rollbacks
CREATE TABLE IF NOT EXISTS public.promotion_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  executed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  executed_by_name TEXT NOT NULL,
  academic_session TEXT NOT NULL,
  term TEXT NOT NULL,
  mappings JSONB NOT NULL,
  execution_order JSONB NOT NULL,
  retained_ids JSONB NOT NULL,
  snapshot_before JSONB NOT NULL, -- Stores pre-promotion student state { id, class_name, status }
  state_hash_before TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed', -- 'completed' | 'reverted'
  created_at TIMESTAMPTZ DEFAULT now(),
  reverted_at TIMESTAMPTZ,
  reverted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Index for fast tenant audit lookups
CREATE INDEX IF NOT EXISTS idx_promotion_batches_school_id ON public.promotion_batches(school_id, created_at DESC);

-- Enable RLS on promotion_batches
ALTER TABLE public.promotion_batches ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can read promotion batches for their school
DROP POLICY IF EXISTS promotion_batches_select_policy ON public.promotion_batches;
CREATE POLICY promotion_batches_select_policy ON public.promotion_batches
  FOR SELECT USING (
    school_id IN (
      SELECT school_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- 2. CREATE SECURITY DEFINER RPC: execute_bulk_promotion_v1
CREATE OR REPLACE FUNCTION public.execute_bulk_promotion_v1(
  _school_id UUID,
  _session TEXT,
  _term TEXT,
  _mappings JSONB,
  _execution_order JSONB,
  _retained_ids JSONB,
  _snapshot_before JSONB,
  _expected_state_hash TEXT,
  _executed_by_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
  v_current_hash TEXT;
  v_batch_id UUID;
  v_src_elem TEXT;
  v_src_class TEXT;
  v_tgt_class TEXT;
  v_retained_array TEXT[];
  v_norm_term TEXT;
BEGIN
  -- A. HARDCODED AUTHORIZATION CHECK (Risk #1 Mitigation)
  SELECT role INTO v_user_role
  FROM public.profiles
  WHERE id = auth.uid() AND school_id = _school_id;

  IF v_user_role IS NULL OR v_user_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorized: User does not have admin privileges for school %', _school_id;
  END IF;

  -- B. TOCTOU RACE CONDITION PREVENTION (Risk #2 Mitigation)
  SELECT 'hash_' || COALESCE(to_hex(abs(hashtext(string_agg(id::text || ':' || class_name || ':' || status, '|' ORDER BY id::text)))), '0')
  INTO v_current_hash
  FROM public.students
  WHERE school_id = _school_id AND status = 'active';

  IF _expected_state_hash IS NOT NULL AND _expected_state_hash <> '' AND v_current_hash <> _expected_state_hash THEN
    RAISE EXCEPTION 'TOCTOU State Mismatch: Student roster was modified by another user. Current hash %, expected %', v_current_hash, _expected_state_hash;
  END IF;

  -- C. CREATE PROMOTION BATCH AUDIT RECORD
  INSERT INTO public.promotion_batches (
    school_id,
    executed_by,
    executed_by_name,
    academic_session,
    term,
    mappings,
    execution_order,
    retained_ids,
    snapshot_before,
    state_hash_before,
    status
  ) VALUES (
    _school_id,
    auth.uid(),
    _executed_by_name,
    _session,
    _term,
    _mappings,
    _execution_order,
    _retained_ids,
    _snapshot_before,
    v_current_hash,
    'completed'
  ) RETURNING id INTO v_batch_id;

  v_norm_term := LOWER(_term);

  -- D. EXECUTE CLASS PROMOTIONS IN TOPOLOGICAL ORDER (Highest class first to prevent double-promotion)
  IF jsonb_typeof(_execution_order) = 'array' THEN
    FOR v_src_elem IN SELECT * FROM jsonb_array_elements_text(_execution_order) LOOP
      v_src_class := v_src_elem;
      v_tgt_class := _mappings ->> v_src_class;

      IF v_tgt_class IS NULL OR v_tgt_class = 'DO_NOT_PROMOTE' THEN
        CONTINUE;
      END IF;

      -- Auto-create destination class in classes table if missing (Risk #7 Resolution)
      IF v_tgt_class <> 'GRADUATE' THEN
        INSERT INTO public.classes (school_id, name, academic_year, term)
        SELECT _school_id, v_tgt_class, _session, v_norm_term
        WHERE NOT EXISTS (
          SELECT 1 FROM public.classes
          WHERE school_id = _school_id AND name = v_tgt_class AND academic_year = _session
        );
      END IF;

      SELECT ARRAY(
        SELECT jsonb_array_elements_text(_retained_ids -> v_src_class)
      ) INTO v_retained_array;

      IF v_tgt_class = 'GRADUATE' THEN
        UPDATE public.students
        SET status = 'graduated', updated_at = now()
        WHERE school_id = _school_id
          AND class_name = v_src_class
          AND status = 'active'
          AND (v_retained_array IS NULL OR id::text <> ALL(v_retained_array));
      ELSE
        UPDATE public.students
        SET class_name = v_tgt_class, updated_at = now()
        WHERE school_id = _school_id
          AND class_name = v_src_class
          AND status = 'active'
          AND (v_retained_array IS NULL OR id::text <> ALL(v_retained_array));
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'message', 'Bulk promotion executed successfully in topological order'
  );
END;
$$;

-- 3. CREATE SECURITY DEFINER RPC: rollback_bulk_promotion_v1
CREATE OR REPLACE FUNCTION public.rollback_bulk_promotion_v1(
  _batch_id UUID,
  _school_id UUID,
  _force BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
  v_batch RECORD;
  v_snap_elem JSONB;
  v_conflicts JSONB := '[]'::jsonb;
  v_current_class TEXT;
  v_current_status TEXT;
  v_student_id UUID;
  v_snap_class TEXT;
  v_expected_target TEXT;
  v_expected_status TEXT;
  v_is_forced BOOLEAN;
BEGIN
  v_is_forced := COALESCE(_force, false);

  -- A. HARDCODED AUTHORIZATION CHECK
  SELECT role INTO v_user_role
  FROM public.profiles
  WHERE id = auth.uid() AND school_id = _school_id;

  IF v_user_role IS NULL OR v_user_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorized: User does not have admin privileges for school %', _school_id;
  END IF;

  -- B. FETCH BATCH AUDIT RECORD
  SELECT * INTO v_batch
  FROM public.promotion_batches
  WHERE id = _batch_id AND school_id = _school_id AND status = 'completed';

  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Batch record % not found or already reverted', _batch_id;
  END IF;

  -- C. DEEP CONFLICT DETECTION (Check post-promotion manual edits)
  IF jsonb_typeof(v_batch.snapshot_before -> 'students') = 'array' THEN
    FOR v_snap_elem IN SELECT * FROM jsonb_array_elements(v_batch.snapshot_before -> 'students') LOOP
      v_student_id := (v_snap_elem ->> 'id')::uuid;
      v_snap_class := v_snap_elem ->> 'class_name';
      
      -- Check if student was specifically retained in their original class
      IF v_batch.retained_ids IS NOT NULL AND jsonb_typeof(v_batch.retained_ids -> v_snap_class) = 'array' THEN
        SELECT ARRAY(
          SELECT jsonb_array_elements_text(v_batch.retained_ids -> v_snap_class)
        ) INTO v_retained_array;
      ELSE
        v_retained_array := NULL;
      END IF;

      IF v_retained_array IS NOT NULL AND v_student_id::text = ANY(v_retained_array) THEN
        v_expected_target := v_snap_class;
        v_expected_status := 'active';
      ELSE
        v_expected_target := v_batch.mappings ->> v_snap_class;
        IF v_expected_target IS NULL OR v_expected_target = 'DO_NOT_PROMOTE' THEN
          v_expected_target := v_snap_class;
          v_expected_status := 'active';
        ELSIF v_expected_target = 'GRADUATE' THEN
          v_expected_status := 'graduated';
        ELSE
          v_expected_status := 'active';
        END IF;
      END IF;

      SELECT class_name, status INTO v_current_class, v_current_status
      FROM public.students
      WHERE id = v_student_id AND school_id = _school_id;

      IF v_current_class IS NULL THEN
        v_conflicts := v_conflicts || jsonb_build_object('id', v_student_id, 'reason', 'Student record missing or deleted');
      ELSIF (v_expected_target <> 'GRADUATE' AND v_current_class <> v_expected_target) THEN
        v_conflicts := v_conflicts || jsonb_build_object('id', v_student_id, 'reason', 'Student class manually changed to ' || v_current_class || ' post-promotion');
      ELSIF v_current_status <> v_expected_status THEN
        v_conflicts := v_conflicts || jsonb_build_object('id', v_student_id, 'reason', 'Student status manually changed to ' || v_current_status || ' post-promotion');
      END IF;
    END LOOP;
  END IF;

  IF v_conflicts <> '[]'::jsonb AND NOT v_is_forced THEN
    RETURN jsonb_build_object(
      'success', false,
      'has_conflicts', true,
      'conflicts', v_conflicts,
      'message', 'Post-promotion edits detected on some students. Use force=true to override.'
    );
  END IF;

  -- D. RESTORE ALL STUDENTS TO SNAPSHOT BEFORE STATE
  IF jsonb_typeof(v_batch.snapshot_before -> 'students') = 'array' THEN
    FOR v_snap_elem IN SELECT * FROM jsonb_array_elements(v_batch.snapshot_before -> 'students') LOOP
      v_student_id := (v_snap_elem ->> 'id')::uuid;
      
      UPDATE public.students
      SET class_name = v_snap_elem ->> 'class_name',
          status = v_snap_elem ->> 'status',
          updated_at = now()
      WHERE id = v_student_id AND school_id = _school_id;
    END LOOP;
  END IF;

  -- E. MARK BATCH AS REVERTED
  UPDATE public.promotion_batches
  SET status = 'reverted',
      reverted_at = now(),
      reverted_by = auth.uid()
  WHERE id = _batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', _batch_id,
    'message', 'Promotion batch reverted successfully'
  );
END;
$$;
