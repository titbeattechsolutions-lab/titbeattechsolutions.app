-- Drop NOT NULL constraint on subject_id in results table

ALTER TABLE results ALTER COLUMN subject_id DROP NOT NULL;
