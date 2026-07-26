import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ymd,
  startOfWeek,
  addDays,
  parseYmd,
  nextDueDate,
  nextInRotation,
  isoWeek,
  byTimeThenRecent,
} from "../date-utils.js";

test("ymd zero-pads month and day", () => {
  assert.equal(ymd(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(ymd(new Date(2026, 11, 31)), "2026-12-31");
});

test("ymd and parseYmd round-trip", () => {
  const s = "2026-07-24";
  assert.equal(ymd(parseYmd(s)), s);
});

test("parseYmd builds a local midnight date", () => {
  const d = parseYmd("2026-07-24");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 6); // July = 6
  assert.equal(d.getDate(), 24);
  assert.equal(d.getHours(), 0);
  assert.equal(d.getMinutes(), 0);
});

test("addDays crosses month and year boundaries", () => {
  assert.equal(ymd(addDays(parseYmd("2026-01-31"), 1)), "2026-02-01");
  assert.equal(ymd(addDays(parseYmd("2026-12-31"), 1)), "2027-01-01");
  assert.equal(ymd(addDays(parseYmd("2026-03-10"), -1)), "2026-03-09");
});

test("startOfWeek returns the Monday, week starting Monday", () => {
  // 2026-07-24 is a Friday -> Monday 2026-07-20
  assert.equal(ymd(startOfWeek(parseYmd("2026-07-24"))), "2026-07-20");
  // Sunday belongs to the week that started the previous Monday
  assert.equal(ymd(startOfWeek(parseYmd("2026-07-26"))), "2026-07-20");
  // A Monday maps to itself
  assert.equal(ymd(startOfWeek(parseYmd("2026-07-20"))), "2026-07-20");
});

test("nextDueDate steps forward by the repeat interval for a future date", () => {
  // A due date well in the future needs exactly one step (already >= today).
  const future = ymd(addDays(new Date(), 100));
  const step = (repeat, days) =>
    assert.equal(
      nextDueDate(future, repeat),
      ymd(addDays(parseYmd(future), days)),
      `${repeat} should advance ${days} day(s)`
    );
  step("daily", 1);
  step("2day", 2);
  step("weekly", 7);
  step("2week", 14);
});

test("nextDueDate skips past dates already gone, landing on/after today", () => {
  const past = ymd(addDays(new Date(), -100));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result = parseYmd(nextDueDate(past, "weekly"));
  assert.ok(result >= today, "result should not be in the past");
  // Result stays on the same weekday as the original due date (weekly cadence)
  assert.equal(result.getDay(), parseYmd(past).getDay());
});

test("nextDueDate returns the due unchanged when there is no repeat", () => {
  assert.equal(nextDueDate("2026-07-24", null), "2026-07-24");
  assert.equal(nextDueDate("2026-07-24", undefined), "2026-07-24");
});

test("nextInRotation cycles through the list and wraps around", () => {
  const rotation = ["Anker", "Edith", "Line"];
  assert.equal(nextInRotation({ assignedTo: "Anker", rotation }), "Edith");
  assert.equal(nextInRotation({ assignedTo: "Edith", rotation }), "Line");
  assert.equal(nextInRotation({ assignedTo: "Line", rotation }), "Anker"); // wrap
});

test("nextInRotation returns the current assignee when there is no real rotation", () => {
  assert.equal(nextInRotation({ assignedTo: "Anker" }), "Anker");
  assert.equal(nextInRotation({ assignedTo: "Anker", rotation: ["Anker"] }), "Anker");
});

test("isoWeek matches known ISO-8601 week numbers", () => {
  assert.equal(isoWeek(parseYmd("2024-01-01")), 1); // Monday, week 1
  assert.equal(isoWeek(parseYmd("2024-01-08")), 2);
  // 2021-01-01 is a Friday that belongs to ISO week 53 of 2020
  assert.equal(isoWeek(parseYmd("2021-01-01")), 53);
});

test("byTimeThenRecent orders open before done", () => {
  const done = { done: true, ts: 100 };
  const open = { done: false, ts: 1 };
  assert.ok(byTimeThenRecent(open, done) < 0);
  assert.ok(byTimeThenRecent(done, open) > 0);
});

test("byTimeThenRecent orders earlier clock time first, timed before untimed", () => {
  const early = { done: false, time: "08:00" };
  const late = { done: false, time: "17:30" };
  const untimed = { done: false };
  assert.ok(byTimeThenRecent(early, late) < 0);
  assert.ok(byTimeThenRecent(early, untimed) < 0); // timed before untimed
  assert.ok(byTimeThenRecent(untimed, late) > 0);
});

test("byTimeThenRecent falls back to most-recently-added", () => {
  const older = { done: false, ts: 100 };
  const newer = { done: false, ts: 200 };
  assert.ok(byTimeThenRecent(newer, older) < 0); // higher ts sorts first
});
