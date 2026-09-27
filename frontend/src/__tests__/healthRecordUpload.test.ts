/**
 * Regression: health-record uploads must go out as multipart/form-data.
 *
 * The shared axios client (`api/client.ts`) defaults to
 * `Content-Type: application/json`, and axios 1.x then JSON-stringifies any
 * FormData payload sent under that content type — a File serialises to `{}`.
 * The document was silently dropped: the API stored records with
 * `file_id = null`, no record ever reported a `file`, and the View/Download
 * buttons could never become active. This test pins the multipart request that
 * makes them work.
 */
import { describe, it, expect, afterEach } from "vitest";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { http } from "../api/client";
import { uploadHealthRecord } from "../api/health-records";

const originalAdapter = http.defaults.adapter;

/** Replaces the transport with a spy adapter and returns the captured config. */
function captureUpload(): { config?: InternalAxiosRequestConfig } {
  const captured: { config?: InternalAxiosRequestConfig } = {};
  const adapter: AxiosAdapter = async (config) => {
    captured.config = config;
    return {
      data: { success: true, message: "Health record uploaded.", data: { id: 1 } },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    } as AxiosResponse;
  };
  http.defaults.adapter = adapter;
  return captured;
}

afterEach(() => {
  http.defaults.adapter = originalAdapter;
});

describe("uploadHealthRecord", () => {
  it("posts FormData as multipart so the document is not dropped", async () => {
    const captured = captureUpload();
    const file = new File(["%PDF-1.4 lab bytes"], "lab-report.pdf", { type: "application/pdf" });
    const form = new FormData();
    form.append("title", "Lab report");
    form.append("doctor", "3");
    form.append("file", file);

    const envelope = await uploadHealthRecord(form);

    expect(envelope.success).toBe(true);
    const config = captured.config;
    expect(config).toBeDefined();
    if (!config) return;

    expect(String(config.method).toLowerCase()).toBe("post");
    expect(config.url).toBe("/health-records/");

    const headers = config.headers as unknown as {
      getContentType?: () => string | undefined;
      "Content-Type"?: string;
    };
    const contentType = headers.getContentType?.() ?? headers["Content-Type"] ?? "";
    expect(contentType).toContain("multipart/form-data");
    // Under application/json axios would have stringified the body instead.
    expect(contentType).not.toContain("application/json");

    expect(config.data).toBeInstanceOf(FormData);
    const body = config.data as FormData;
    expect(body.get("title")).toBe("Lab report");
    expect(body.get("doctor")).toBe("3");
    // The uploaded File survives to the wire — this is what used to break.
    expect(body.get("file")).toBe(file);
  });
});
