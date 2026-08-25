import assert from "node:assert/strict";
import test from "node:test";
import {
  API_ERROR_MESSAGES,
  CodedApiError,
  apiErrorBody,
  apiErrorCode,
  apiErrorCodeFromPayload,
  apiErrorMessage,
  apiErrorResponse,
  isCodedApiError,
  readJsonBody,
  type ApiErrorCode,
} from "../src/lib/api-errors";

test("every API error code has non-empty English and German messages", () => {
  for (const [code, messages] of Object.entries(API_ERROR_MESSAGES)) {
    assert.ok(messages.en.trim(), `${code} is missing an English message`);
    assert.ok(messages.de.trim(), `${code} is missing a German message`);
  }
});

test("API error bodies keep an English fallback alongside the stable code", () => {
  assert.deepEqual(apiErrorBody("IMAGE_TOO_LARGE"), {
    code: "IMAGE_TOO_LARGE",
    error: "The image exceeds the configured upload limit.",
  });
});

test("API error responses preserve the requested status and JSON contract", async () => {
  const response = apiErrorResponse("AUTH_REQUIRED", 401);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(await response.json(), {
    code: "AUTH_REQUIRED",
    error: "You must be signed in.",
  });
});

test("client messages localize known codes and localize the fallback for unknown payloads", () => {
  const english = (en: string) => en;
  const german = (_en: string, de: string) => de;
  const fallback = { en: "Request failed.", de: "Anfrage fehlgeschlagen." };

  assert.equal(apiErrorMessage({ code: "SPACE_NOT_FOUND" }, english, fallback), "The space was not found.");
  assert.equal(apiErrorMessage({ code: "SPACE_NOT_FOUND" }, german, fallback), "Der Bereich wurde nicht gefunden.");
  assert.equal(apiErrorMessage({ code: "UNKNOWN", error: "Raw server text" }, german, fallback), fallback.de);
  assert.equal(apiErrorMessage({ error: "Legacy English text" }, german, fallback), fallback.de);
});

test("payload and exception helpers only accept known typed error codes", () => {
  assert.equal(apiErrorCodeFromPayload({ code: "INVALID_INPUT" }), "INVALID_INPUT");
  assert.equal(apiErrorCodeFromPayload({ code: "NOT_A_REAL_CODE" }), null);
  assert.equal(apiErrorCodeFromPayload({ code: "constructor" }), null);
  assert.equal(apiErrorCodeFromPayload({ code: "__proto__" }), null);
  assert.equal(apiErrorCodeFromPayload(Object.create({ code: "AUTH_REQUIRED" })), null);
  assert.equal(apiErrorCode(new CodedApiError("IMAGE_EMPTY"), "IMAGE_SAVE_FAILED"), "IMAGE_EMPTY");
  assert.equal(apiErrorCode(new Error("unexpected"), "IMAGE_SAVE_FAILED"), "IMAGE_SAVE_FAILED");
  assert.equal(isCodedApiError(new CodedApiError("IMAGE_EMPTY")), true);
  assert.equal(isCodedApiError(new Error("unexpected")), false);

  const code: ApiErrorCode = apiErrorBody("TEAM_NAME_CONFLICT").code;
  assert.equal(code, "TEAM_NAME_CONFLICT");
});

test("JSON body parsing returns undefined for empty and malformed requests", async () => {
  const valid = new Request("http://atlas.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Atlas" }),
  });
  const malformed = new Request("http://atlas.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  const empty = new Request("http://atlas.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  assert.deepEqual(await readJsonBody(valid), { name: "Atlas" });
  assert.equal(await readJsonBody(malformed), undefined);
  assert.equal(await readJsonBody(empty), undefined);
});
