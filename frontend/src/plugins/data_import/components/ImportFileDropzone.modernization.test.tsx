import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ImportFileDropzone } from "./ImportFileDropzone";

describe("ImportFileDropzone modernization", () => {
  it("uses a GlassCard upload surface and semantic dropzone styling", () => {
    const { container } = render(<ImportFileDropzone file={null} onFileAccepted={() => {}} />);

    expect(container.querySelector(".shadow-glass")).toBeInTheDocument();
    expect(container.querySelector('[class*="border-muted-foreground"]')).toBeNull();
  });
});
