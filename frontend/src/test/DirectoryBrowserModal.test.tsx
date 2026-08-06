import React from "react";
import { render } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import DirectoryBrowserModal from "../components/DirectoryBrowserModal";

vi.mock("../services/api", () => ({
  browseDirectory: vi.fn().mockResolvedValue([]),
}));

import { browseDirectory } from "../services/api";

describe("DirectoryBrowserModal — fallback path portability (J2)", () => {
  it('starts at "/" when initialPath is not provided', () => {
    render(
      <DirectoryBrowserModal
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(browseDirectory).toHaveBeenCalledWith("/");
    expect(browseDirectory).not.toHaveBeenCalledWith("/home/gamer");
  });
});
