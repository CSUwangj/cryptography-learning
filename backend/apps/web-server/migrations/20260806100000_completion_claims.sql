-- Create the immutable Completion Claims table.
CREATE TABLE completion_claims (
    course_run      TEXT NOT NULL,
    student_id      TEXT NOT NULL,
    lab_id          TEXT NOT NULL,
    completed_at    TEXT NOT NULL,
    received_at     INTEGER NOT NULL,
    key_id          TEXT NOT NULL,
    signed_evidence TEXT NOT NULL,
    PRIMARY KEY (course_run, student_id, lab_id)
);
