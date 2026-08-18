import assert from "node:assert/strict";
import test from "node:test";
import { opensSpacePicker, spaceNavigationHref } from "../src/lib/space-navigation";

test("space links target the first page when one exists", () => {
  assert.equal(
    spaceNavigationHref({ id: "space one", pages: [{ id: "page & one" }, { id: "page-two" }] }),
    "/?space=space+one&page=page+%26+one",
  );
});

test("space links target the space itself when it has no pages", () => {
  assert.equal(spaceNavigationHref({ id: "space-one", pages: [] }), "/?space=space-one");
});

test("only a plain primary click opens the picker instead of following the link", () => {
  const plainClick = { button: 0, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
  assert.equal(opensSpacePicker(plainClick), true);
  assert.equal(opensSpacePicker({ ...plainClick, button: 1 }), false);
  assert.equal(opensSpacePicker({ ...plainClick, ctrlKey: true }), false);
  assert.equal(opensSpacePicker({ ...plainClick, metaKey: true }), false);
  assert.equal(opensSpacePicker({ ...plainClick, shiftKey: true }), false);
  assert.equal(opensSpacePicker({ ...plainClick, altKey: true }), false);
});
