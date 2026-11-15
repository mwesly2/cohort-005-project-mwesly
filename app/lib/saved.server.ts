import { and, desc, eq } from "drizzle-orm";
import { bookmarks, courses, lessons, modules, notes } from "~/db/schema";
import type { Db } from "~/lib/comments.server";

// Bookmarks and Notes belong to the Student who made them. Nothing here reads
// another Student's rows, and no other role is given a way to read them.

export const MAX_NOTE_LENGTH = 5000;

export function isBookmarked(db: Db, userId: number, lessonId: number) {
  return !!db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.lessonId, lessonId)))
    .get();
}

/** Flips the Student's Bookmark on a Lesson. Returns whether it is now set. */
export function toggleBookmark(db: Db, userId: number, lessonId: number) {
  const removed = db
    .delete(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.lessonId, lessonId)))
    .returning({ id: bookmarks.id })
    .all();
  if (removed.length > 0) return false;

  // A concurrent toggle may have inserted first; the unique index makes that
  // a no-op rather than an error.
  db.insert(bookmarks).values({ userId, lessonId }).onConflictDoNothing().run();
  return true;
}

export function getNote(db: Db, userId: number, lessonId: number) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
    .get();
}

/**
 * Writes the Student's Note on a Lesson. The body is expected trimmed; an
 * empty body deletes the Note.
 */
export function saveNote(
  db: Db,
  userId: number,
  lessonId: number,
  body: string,
  now: Date
) {
  if (body.length === 0) {
    db.delete(notes)
      .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
      .run();
    return;
  }

  const timestamp = now.toISOString();
  db.insert(notes)
    .values({
      userId,
      lessonId,
      body,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [notes.userId, notes.lessonId],
      set: { body, updatedAt: timestamp },
    })
    .run();
}

const lessonRef = {
  lessonId: lessons.id,
  lessonTitle: lessons.title,
  moduleTitle: modules.title,
  courseTitle: courses.title,
  courseSlug: courses.slug,
};

/** The Student's Bookmarks, newest first, with the Lesson each points at. */
export function listBookmarks(db: Db, userId: number) {
  return db
    .select({ id: bookmarks.id, createdAt: bookmarks.createdAt, ...lessonRef })
    .from(bookmarks)
    .innerJoin(lessons, eq(bookmarks.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.createdAt))
    .all();
}

/** The Student's Notes, most recently edited first, with their Lessons. */
export function listNotes(db: Db, userId: number) {
  return db
    .select({
      id: notes.id,
      body: notes.body,
      updatedAt: notes.updatedAt,
      ...lessonRef,
    })
    .from(notes)
    .innerJoin(lessons, eq(notes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt))
    .all();
}
