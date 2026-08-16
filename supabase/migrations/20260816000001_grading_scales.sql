-- Add dynamic grading scale to schools table
ALTER TABLE public.schools 
ADD COLUMN IF NOT EXISTS grading_scale JSONB DEFAULT '[
  {"min": 75, "max": 100, "grade": "A1", "remark": "Excellent"},
  {"min": 70, "max": 74, "grade": "B2", "remark": "Very Good"},
  {"min": 65, "max": 69, "grade": "B3", "remark": "Good"},
  {"min": 50, "max": 64, "grade": "C4", "remark": "Credit"},
  {"min": 40, "max": 49, "grade": "D7", "remark": "Pass"},
  {"min": 0,  "max": 39, "grade": "F9", "remark": "Fail"}
]'::jsonb;
