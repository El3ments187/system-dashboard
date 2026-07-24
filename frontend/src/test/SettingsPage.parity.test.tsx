// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, screen } from "@testing-library/react";
import SettingsPage from "../pages/SettingsPage";

vi.mock("../services/api", () => ({
  getAiSettings: vi.fn().mockResolvedValue({
    llama_server_url: "http://localhost:8081",
    openwebui_url: "http://localhost:3000",
    opencode_url: "http://localhost:4000",
    comfyui_url: "http://localhost:8188",
  }),
  updateAiSettings: vi.fn().mockResolvedValue({}),
  testConnection: vi.fn().mockResolvedValue({ available: true }),
  getRepoInfo: vi.fn().mockResolvedValue(null),
  getSettingsLocation: vi
    .fn()
    .mockResolvedValue({ path: "/home/user/.config/model-deck/settings.json", exists: false }),
}));

vi.mock("../components/DirectoryBrowserModal", () => ({
  default: () => null,
}));

vi.mock("../components/EditUpdateScriptModal", () => ({
  default: () => null,
}));

const accent = { color: "var(--accent-primary)", glow: "var(--accent-glow)" };

describe("SettingsPage card spine parity", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("every settings-card has data-accent-el on root", async () => {
    const { container } = render(<SettingsPage accent={accent} />);
    await waitFor(() => {
      const cards = container.querySelectorAll(".settings-card");
      expect(cards.length).toBeGreaterThanOrEqual(3);
    });
    const cards = container.querySelectorAll(".settings-card");
    cards.forEach((card) => {
      expect(card).toHaveAttribute("data-accent-el");
    });
  });

  it("every settings-card has .card-accent-spine.accent-glow-target as a child", async () => {
    const { container } = render(<SettingsPage accent={accent} />);
    await waitFor(() => {
      const cards = container.querySelectorAll(".settings-card");
      expect(cards.length).toBeGreaterThanOrEqual(3);
    });
    const cards = container.querySelectorAll(".settings-card");
    cards.forEach((card) => {
      const spine = card.querySelector(".card-accent-spine.accent-glow-target");
      expect(spine).toBeTruthy();
    });
  });

  it("settings-card spine has no inline opacity — Pulse is CSS-only on ::after", async () => {
    const { container } = render(<SettingsPage accent={accent} />);
    await waitFor(() => {
      expect(
        container.querySelectorAll(".card-accent-spine").length,
      ).toBeGreaterThan(0);
    });
    const spines = container.querySelectorAll(
      ".card-accent-spine",
    ) as NodeListOf<HTMLElement>;
    spines.forEach((spine) => {
      expect(spine.style.opacity).toBe("");
    });
  });
});

describe("SettingsPage N — layout + truncation (Step N)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows a full-value tooltip on the Working Directory path field", async () => {
    const longPath =
      "/home/user/very/long/path/to/llama/cpp/working/directory/that/exceeds/field/width";
    localStorage.setItem("llama_cpp_dir", longPath);
    const { container } = render(<SettingsPage accent={accent} />);
    await waitFor(() => {
      const input = container.querySelector('input[name="llama-working-dir"]');
      expect(input).toBeTruthy();
    });
    const input = container.querySelector(
      'input[name="llama-working-dir"]',
    ) as HTMLInputElement;
    expect(input).toHaveAttribute("title", longPath);
  });

  it("groups cards under Connections, Documentation, and Diagnostics section labels", async () => {
    render(<SettingsPage accent={accent} />);
    await waitFor(() => {
      expect(screen.getByText("Connections")).toBeInTheDocument();
    });
    expect(screen.getByText("Documentation")).toBeInTheDocument();
    expect(screen.getByText("Diagnostics")).toBeInTheDocument();
  });
});
