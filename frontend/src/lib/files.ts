/**
 * Authenticated media open/download helpers.
 *
 * `/media/{id}` serves medical documents only with an `Authorization: Bearer`
 * header (`assertMediaReadable`), and tokens live in sessionStorage — so a
 * plain `<a href="/media/5" target="_blank">` navigation gets a 401 JSON body
 * instead of the file. These helpers fetch the bytes WITH the JWT (through the
 * shared axios client, so a 401 transparently refreshes and retries), then:
 *
 *  - openMediaFile()      → blob URL opened in a new tab (browser renders
 *                           PDFs/images inline; anything else downloads);
 *  - downloadMediaFile()  → same blob, but a hidden `<a download>` forces a
 *                           save under the record's original filename.
 *
 * The pure naming helpers are unit-tested in tests/health-record-file.test.ts.
 */
import { http } from "../api/client";

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

function extFromContentType(contentType: string | null | undefined): string {
  if (!contentType) return "";
  const normalized = contentType.split(";")[0].trim().toLowerCase();
  return EXT_BY_CONTENT_TYPE[normalized] ?? "";
}

/**
 * Display/save name for a record's file: the uploaded original filename when
 * known, otherwise the record title plus an extension guessed from the
 * content type (falls back to no extension — the browser picks one).
 */
export function mediaDownloadName(record: {
  file_name?: string | null;
  file_content_type?: string | null;
  title?: string;
}): string {
  if (record.file_name) return record.file_name;
  const ext = extFromContentType(record.file_content_type);
  const base = (record.title || "record").replace(/[\\/:*?"<>|]+/g, "-").trim();
  const safe = base || "record";
  if (!ext) return safe;
  return safe.toLowerCase().endsWith(ext) ? safe : `${safe}${ext}`;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Could not open the file. Please try again.";
}

async function fetchMediaBlob(path: string): Promise<Blob> {
  // baseURL "/" because /media/* is NOT under the /api prefix.
  const res = await http.get<Blob>(path, { baseURL: "/", responseType: "blob" });
  if (!(res.data instanceof Blob) || res.data.size === 0) {
    throw new Error("The file is empty or could not be read.");
  }
  return res.data;
}

function clickAnchor(anchor: HTMLAnchorElement): void {
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** Open the media file in a new tab (view). Errors go to onError, never throw. */
export async function openMediaFile(
  path: string,
  name: string,
  onError?: (message: string) => void
): Promise<boolean> {
  try {
    const blob = await fetchMediaBlob(path);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.title = name;
    clickAnchor(anchor);
    // Keep the URL alive while the viewer loads the document, then free it.
    window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
    return true;
  } catch (error) {
    onError?.(errorMessage(error));
    return false;
  }
}

/** Download the media file under its original name. Errors go to onError. */
export async function downloadMediaFile(
  path: string,
  name: string,
  onError?: (message: string) => void
): Promise<boolean> {
  try {
    const blob = await fetchMediaBlob(path);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    clickAnchor(anchor);
    // The download reads the blob at click time; free it shortly after.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch (error) {
    onError?.(errorMessage(error));
    return false;
  }
}
