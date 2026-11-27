import { RETIRED_SAMPLE_LESSON_IDS } from "@lfct/curriculum/ingest";
import type pg from "pg";

/**
 * Clears what learners left on the removed sample lessons in an older database: progress, bookmarks, discussion
 * posts (votes and reports go with them) and discussion follows. The ingest already deleted the lessons themselves.
 * Private notes are kept: they are the learner's own text, and a note on a missing lesson is simply not shown.
 */
export async function retireSampleLessons(pool: pg.Pool): Promise<number> {
  const ids = RETIRED_SAMPLE_LESSON_IDS;
  let n = 0;
  n += (await pool.query("DELETE FROM lesson_progress WHERE lesson_id = ANY($1)", [ids])).rowCount ?? 0;
  n += (await pool.query("DELETE FROM bookmark WHERE target_type = 'lesson' AND target_id = ANY($1)", [ids])).rowCount ?? 0;
  n += (await pool.query("DELETE FROM discussion_post WHERE target_type = 'lesson' AND target_id = ANY($1)", [ids])).rowCount ?? 0;
  n += (await pool.query("DELETE FROM discussion_follow WHERE target_type = 'lesson' AND target_id = ANY($1)", [ids])).rowCount ?? 0;
  return n;
}
