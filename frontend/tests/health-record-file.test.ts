/**
 * Health-record file Open/Download support.
 *
 * Root cause covered here: `/media/{id}` requires a Bearer header, so the old
 * bare `<a href target="_blank">` returned 401 JSON instead of the file on
 * every surface (patient settings, doctor treatment screen, visit history).
 * The fix fetches bytes with the JWT (ui/lib/files.ts) and the DTO now carries
 * the original filename + content type so a real filename can be saved.
 */
import { describe, expect, it } from "vitest";
import { mediaDownloadName } from "@/src/lib/files";
import { healthRecordDto } from "@/lib/serializers";

describe("mediaDownloadName — filename used for Open/Download", () => {
  it("prefers the uploaded original filename", () => {
    expect(
      mediaDownloadName({ file_name: "lab-report-2026.pdf", title: "Blood work", file_content_type: "image/png" })
    ).toBe("lab-report-2026.pdf");
  });

  it("falls back to the record title + extension from the content type", () => {
    expect(
      mediaDownloadName({ file_name: null, title: "Blood work", file_content_type: "application/pdf" })
    ).toBe("Blood work.pdf");
    expect(
      mediaDownloadName({ file_name: null, title: "X-ray", file_content_type: "image/jpeg; charset=binary" })
    ).toBe("X-ray.jpg");
  });

  it("does not double the extension when the title already ends with it", () => {
    expect(
      mediaDownloadName({ file_name: null, title: "scan.PDF", file_content_type: "application/pdf" })
    ).toBe("scan.PDF");
  });

  it("sanitises characters that are illegal in filenames", () => {
    expect(
      mediaDownloadName({ file_name: null, title: 'a/b:c*?d"e<f>g|h', file_content_type: "text/plain" })
    ).toBe("a-b-c-d-e-f-g-h.txt");
  });

  it("never returns an empty name and tolerates unknown types", () => {
    expect(mediaDownloadName({ file_name: null, title: "", file_content_type: null })).toBe("record");
    expect(
      mediaDownloadName({ file_name: null, title: "mystery", file_content_type: "application/x-unknown" })
    ).toBe("mystery");
  });
});

describe("healthRecordDto — file metadata for the Open/Download buttons", () => {
  const req = new Request("http://localhost/api/health-records/");

  const base = {
    id: 7,
    patient_id: 2,
    doctor_id: 3,
    appointment_id: null,
    file_id: 55,
    record_type: "lab_report",
    title: "Blood work",
    description: "",
    created_at: new Date("2026-09-27T08:00:00Z"),
    updated_at: new Date("2026-09-27T08:00:00Z"),
  } as const;

  it("exposes the media URL, original filename and content type", () => {
    const dto = healthRecordDto(
      { ...base, file: { filename: "blood-work.pdf", contentType: "application/pdf" } },
      req
    );
    expect(dto.file).toBe("/media/55/");
    expect(dto.file_name).toBe("blood-work.pdf");
    expect(dto.file_content_type).toBe("application/pdf");
  });

  it("emits nulls (not undefined) when a record has no file", () => {
    const dto = healthRecordDto({ ...base, file_id: null, file: null }, req);
    expect(dto.file).toBeNull();
    expect(dto.file_name).toBeNull();
    expect(dto.file_content_type).toBeNull();
  });

  it("still serialises file metadata as null when the relation was not loaded", () => {
    const dto = healthRecordDto({ ...base }, req);
    expect(dto.file).toBe("/media/55/");
    expect(dto.file_name).toBeNull();
    expect(dto.file_content_type).toBeNull();
  });
});
