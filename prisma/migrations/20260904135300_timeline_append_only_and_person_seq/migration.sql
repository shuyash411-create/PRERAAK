-- Invariant 1.3: timeline_events is append-only.
--
-- The application has no UPDATE or DELETE path to this table and a test
-- asserts that stays true. This trigger is the belt to that test's braces: it
-- rejects mutation even from a direct psql session, a future migration, or a
-- careless raw query.
CREATE OR REPLACE FUNCTION timeline_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'timeline_events is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS timeline_events_no_update_delete ON "timeline_events";
CREATE TRIGGER timeline_events_no_update_delete
  BEFORE UPDATE OR DELETE ON "timeline_events"
  FOR EACH ROW EXECUTE FUNCTION timeline_events_append_only();

-- Invariant 1.1: one person, one permanent identity.
--
-- person_id is allocated from this sequence as PRR- plus six zero-padded
-- digits. Gaps are acceptable (a rolled-back transaction burns a number);
-- reuse is not, which is exactly what a sequence guarantees.
CREATE SEQUENCE IF NOT EXISTS person_id_seq START 1;
