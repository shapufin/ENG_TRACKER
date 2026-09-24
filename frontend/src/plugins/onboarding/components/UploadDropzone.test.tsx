import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import { UploadDropzone } from "./UploadDropzone";

describe("UploadDropzone", () => {
  it("calls onFiles when a native file drop occurs", () => {
    const onFiles = vi.fn();
    render(<UploadDropzone onFiles={onFiles} />);
    const zone = screen.getByTestId("onboarding-upload-dropzone");
    const file = new File(["hi"], "doc.pdf", { type: "application/pdf" });

    fireEvent.drop(zone, { dataTransfer: { files: [file], types: ["Files"] } });

    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it("ignores a drop that has no Files type (e.g. an in-app dnd-kit drag)", () => {
    const onFiles = vi.fn();
    render(<UploadDropzone onFiles={onFiles} />);
    const zone = screen.getByTestId("onboarding-upload-dropzone");

    fireEvent.drop(zone, { dataTransfer: { files: [], types: ["text/plain"] } });

    expect(onFiles).not.toHaveBeenCalled();
  });

  it("toggles drag-over styling state", () => {
    const onFiles = vi.fn();
    render(<UploadDropzone onFiles={onFiles} />);
    const zone = screen.getByTestId("onboarding-upload-dropzone");

    fireEvent.dragOver(zone, { dataTransfer: { types: ["Files"] } });
    expect(zone.className).toContain("border-primary");

    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain("border-primary");
  });

  it("triggers onFiles via the hidden file input", () => {
    const onFiles = vi.fn();
    render(<UploadDropzone onFiles={onFiles} />);
    const input = screen.getByTestId("onboarding-upload-input");
    const file = new File(["hi"], "doc.pdf", { type: "application/pdf" });

    fireEvent.change(input, { target: { files: [file] } });

    expect(onFiles).toHaveBeenCalledWith([file]);
  });
});
