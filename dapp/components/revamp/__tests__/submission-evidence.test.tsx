import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SafeEvidenceValue, SubmissionResponseFields } from "../submission-evidence";

describe("safe submission evidence", () => {
  it("renders user-authored HTML as escaped text", () => {
    const {container} = render(<SafeEvidenceValue value={'<img src=x onerror="alert(1)"><script>alert(1)</script>'} />);
    expect(container.querySelector("script,img")).toBeNull();
    expect(container.textContent).toContain("<script>");
  });
  it("does not turn unsafe URL schemes into links", () => {
    const {container} = render(<SafeEvidenceValue value="javascript:alert(1)" />);
    expect(container.querySelector("a")).toBeNull();
  });
  it("renders validated evidence links with an isolated browsing context", () => {
    render(<SafeEvidenceValue value="https://example.com/proof" />);
    expect(screen.getByRole("link")).toHaveAttribute("rel", "noopener noreferrer");
  });
  it("uses a plain hyphen for blank optional answers", () => {
    render(<SubmissionResponseFields quest={{sub_tasks: [{title: "Optional proof"}]}} content="" />);
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("uses revocable Blob downloads for active inline file formats without embedding them", () => {
    const create = jest.fn().mockReturnValue("blob:submitted-file");
    const revoke = jest.fn();
    Object.defineProperty(URL, "createObjectURL", {value: create, configurable: true});
    Object.defineProperty(URL, "revokeObjectURL", {value: revoke, configurable: true});
    const file = JSON.stringify({format: "ckboost-file", name: "proof.svg", type: "image/svg+xml", size: 5, data_url: "data:image/svg+xml;base64,PHN2Zz4="});
    const {container, unmount} = render(<SafeEvidenceValue value={file} />);
    expect(screen.getByRole("link")).toHaveAttribute("download", "proof.svg");
    expect(screen.getByRole("link")).toHaveAttribute("href", "blob:submitted-file");
    expect(container.querySelector("img,iframe,object,svg")).toBeNull();
    expect(create.mock.calls[0][0].type).toBe("application/octet-stream");
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:submitted-file");
  });
});
