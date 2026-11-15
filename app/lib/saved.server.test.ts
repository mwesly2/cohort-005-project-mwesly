import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import {
  getNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  saveNote,
  toggleBookmark,
} from "./saved.server";

type TestDb = ReturnType<typeof createTestDb>;

const EARLIER = new Date(2026, 9, 6, 12, 0, 0);
const LATER = new Date(2026, 9, 7, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let otherLessonId: number;
let otherStudentId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  [lessonId, otherLessonId] = [1, 2].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );

  otherStudentId = db
    .insert(schema.users)
    .values({
      name: "Other Student",
      email: "other@example.com",
      role: schema.UserRole.Student,
    })
    .returning()
    .get().id;
});

describe("toggling a Bookmark", () => {
  it("sets the Bookmark, then clears it", () => {
    expect(toggleBookmark(db, base.user.id, lessonId)).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonId)).toBe(true);

    expect(toggleBookmark(db, base.user.id, lessonId)).toBe(false);
    expect(isBookmarked(db, base.user.id, lessonId)).toBe(false);
  });

  it("leaves another Student's Bookmark alone", () => {
    toggleBookmark(db, otherStudentId, lessonId);
    toggleBookmark(db, base.user.id, lessonId);
    toggleBookmark(db, base.user.id, lessonId);

    expect(isBookmarked(db, otherStudentId, lessonId)).toBe(true);
  });
});

describe("saving a Note", () => {
  it("creates the Note, then updates it in place", () => {
    saveNote(db, base.user.id, lessonId, "First", EARLIER);
    saveNote(db, base.user.id, lessonId, "Second", LATER);

    expect(getNote(db, base.user.id, lessonId)).toMatchObject({
      body: "Second",
      createdAt: EARLIER.toISOString(),
      updatedAt: LATER.toISOString(),
    });
    expect(db.select().from(schema.notes).all()).toHaveLength(1);
  });

  it("deletes the Note when the body is empty", () => {
    saveNote(db, base.user.id, lessonId, "First", EARLIER);
    saveNote(db, base.user.id, lessonId, "", LATER);

    expect(getNote(db, base.user.id, lessonId)).toBeUndefined();
  });
});

describe("listing what a Student saved", () => {
  it("lists only that Student's Bookmarks, with their Lessons", () => {
    toggleBookmark(db, base.user.id, lessonId);
    toggleBookmark(db, otherStudentId, otherLessonId);

    expect(listBookmarks(db, base.user.id)).toEqual([
      expect.objectContaining({
        lessonId,
        lessonTitle: "Lesson 1",
        moduleTitle: "Basics",
        courseTitle: "Test Course",
        courseSlug: "test-course",
      }),
    ]);
  });

  it("lists only that Student's Notes, most recently edited first", () => {
    saveNote(db, base.user.id, lessonId, "Older", EARLIER);
    saveNote(db, base.user.id, otherLessonId, "Newer", LATER);
    saveNote(db, otherStudentId, lessonId, "Not mine", LATER);

    expect(listNotes(db, base.user.id).map((note) => note.body)).toEqual([
      "Newer",
      "Older",
    ]);
  });
});
