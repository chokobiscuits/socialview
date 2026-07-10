import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { bucketToHour } from "./bucket";

describe("snapshot bucketing", () => {
  test("floors to the hour so one sync run shares one capturedAt", () => {
    const a = bucketToHour(new Date("2026-07-09T14:07:31.482Z"));
    const b = bucketToHour(new Date("2026-07-09T14:59:59.999Z"));
    assert.equal(a.toISOString(), "2026-07-09T14:00:00.000Z");
    assert.equal(
      a.getTime(),
      b.getTime(),
      "two writes in the same hour must group together",
    );
  });

  test("does not bleed into the next hour", () => {
    assert.equal(
      bucketToHour(new Date("2026-07-09T15:00:00.000Z")).toISOString(),
      "2026-07-09T15:00:00.000Z",
    );
  });

  test("is idempotent", () => {
    const once = bucketToHour(new Date("2026-07-09T14:07:31.482Z"));
    assert.equal(bucketToHour(once).getTime(), once.getTime());
  });
});
