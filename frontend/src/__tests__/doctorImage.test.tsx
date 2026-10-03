/**
 * Doctor photo gate — `resolveDoctorImage` + the "No image" state.
 *
 * A doctor's picture is either their own uploaded media file or nothing. This
 * pins the three cases the cards must never get wrong: an external URL (a
 * borrowed face), a non-media same-origin path (the splash artwork), and an
 * image whose bytes fail to load (a deleted media object).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DoctorImage, NO_IMAGE_LABEL, resolveDoctorImage } from "../components/DoctorImage";

describe("resolveDoctorImage", () => {
  it("accepts this app's own media URLs, trailing slash and all", () => {
    expect(resolveDoctorImage("/media/123/")).toBe("/media/123/");
    expect(resolveDoctorImage("/media/123")).toBe("/media/123");
    expect(resolveDoctorImage("/media/profile_images/a.jpg")).toBe("/media/profile_images/a.jpg");
    expect(resolveDoctorImage("  /media/456/  ")).toBe("/media/456/");
    // The running origin (jsdom: localhost:3000) is our own host.
    expect(resolveDoctorImage("http://localhost:3000/media/123/")).toBe("/media/123/");
  });

  it("rejects missing, empty and junk values", () => {
    expect(resolveDoctorImage(null)).toBeNull();
    expect(resolveDoctorImage(undefined)).toBeNull();
    expect(resolveDoctorImage("")).toBeNull();
    expect(resolveDoctorImage("   ")).toBeNull();
    expect(resolveDoctorImage("not a url")).toBeNull();
    expect(resolveDoctorImage("/media/")).toBeNull();
    expect(resolveDoctorImage("/images/splash-screen.jpeg")).toBeNull();
    expect(resolveDoctorImage("//evil.test/x.png")).toBeNull();
    expect(resolveDoctorImage("data:image/png;base64,AAAA")).toBeNull();
  });

  it("rejects every other host, including stock-portrait CDNs", () => {
    expect(
      resolveDoctorImage(
        "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=500&q=85"
      )
    ).toBeNull();
    expect(resolveDoctorImage("https://evil.test/media/123/")).toBeNull();
    expect(resolveDoctorImage("http://localhost:3001/media/123/")).toBeNull();
  });
});

describe("DoctorImage", () => {
  it("renders the uploaded photo through the image optimizer", () => {
    const { container } = render(
      <DoctorImage src="/media/123/" alt="Dr. Neema Kimaro" width={500} height={333} sizes="25vw" />
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(decodeURIComponent(img?.getAttribute("src") ?? "")).toContain("/media/123/");
    expect(img).toHaveAttribute("sizes", "25vw");
  });

  it("shows No image — with no <img> at all — when the doctor has no photo", () => {
    const { container } = render(
      <DoctorImage src={null} alt="Dr. John Mrema" width={500} height={333} sizes="40vw" />
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: NO_IMAGE_LABEL })).toBeInTheDocument();
    expect(container.textContent).toContain("No image");
  });

  it("shows No image instead of a borrowed face from another host", () => {
    const { container } = render(
      <DoctorImage
        src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2"
        alt="Dr. Asha Juma"
        width={500}
        height={333}
        sizes="40vw"
      />
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: NO_IMAGE_LABEL })).toBeInTheDocument();
  });

  it("swaps to No image when the file fails to load (deleted media object)", () => {
    const { container } = render(
      <DoctorImage src="/media/999/" alt="Dr. Deleted Photo" width={500} height={333} sizes="40vw" />
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: NO_IMAGE_LABEL })).toBeInTheDocument();
  });

  it("retries the photo once a new upload replaces a failed one", () => {
    const { container, rerender } = render(
      <DoctorImage src="/media/1/" alt="Dr. New Photo" width={500} height={333} sizes="40vw" />
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();

    rerender(
      <DoctorImage src="/media/2/" alt="Dr. New Photo" width={500} height={333} sizes="40vw" />
    );
    expect(container.querySelector("img")).not.toBeNull();
  });
});
