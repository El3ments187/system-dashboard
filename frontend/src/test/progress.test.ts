import {
  WARNING_THRESHOLD,
  CRITICAL_THRESHOLD,
  TEMP_WARNING_THRESHOLD,
  TEMP_CRITICAL_THRESHOLD,
  STORAGE_TEMP_WARNING_THRESHOLD,
  STORAGE_TEMP_CRITICAL_THRESHOLD,
  worseState,
  getStateColor,
  getStateLabel,
  getProgressState,
  getProgressColor,
  getTempState,
  getTempColor,
  getStorageTempState,
  getStorageTempColor,
  getProgressGradient,
} from "../utils/progress";

describe("Threshold Constants", () => {
  it("defines WARNING_THRESHOLD at 70%", () => {
    expect(WARNING_THRESHOLD).toBe(70);
  });

  it("defines CRITICAL_THRESHOLD at 90%", () => {
    expect(CRITICAL_THRESHOLD).toBe(90);
  });

  it("defines TEMP_WARNING_THRESHOLD at 80°C", () => {
    expect(TEMP_WARNING_THRESHOLD).toBe(80);
  });

  it("defines TEMP_CRITICAL_THRESHOLD at 90°C", () => {
    expect(TEMP_CRITICAL_THRESHOLD).toBe(90);
  });

  it("defines STORAGE_TEMP_WARNING_THRESHOLD at 50°C", () => {
    expect(STORAGE_TEMP_WARNING_THRESHOLD).toBe(50);
  });

  it("defines STORAGE_TEMP_CRITICAL_THRESHOLD at 65°C", () => {
    expect(STORAGE_TEMP_CRITICAL_THRESHOLD).toBe(65);
  });
});

describe("worseState", () => {
  it("returns the worse of two states", () => {
    expect(worseState("normal", "warning")).toBe("warning");
    expect(worseState("warning", "normal")).toBe("warning");
    expect(worseState("normal", "critical")).toBe("critical");
    expect(worseState("critical", "normal")).toBe("critical");
    expect(worseState("warning", "critical")).toBe("critical");
    expect(worseState("critical", "warning")).toBe("critical");
  });

  it("returns the same state when both are equal", () => {
    expect(worseState("normal", "normal")).toBe("normal");
    expect(worseState("warning", "warning")).toBe("warning");
    expect(worseState("critical", "critical")).toBe("critical");
  });
});

describe("getStateColor", () => {
  it("returns danger for critical state", () => {
    expect(getStateColor("critical")).toBe("var(--danger)");
  });

  it("returns warning for warning state", () => {
    expect(getStateColor("warning")).toBe("var(--warning)");
  });

  it("returns success for normal state", () => {
    expect(getStateColor("normal")).toBe("var(--success)");
  });
});

describe("getStateLabel", () => {
  it("returns Critical label", () => {
    expect(getStateLabel("critical")).toBe("Critical");
  });

  it("returns Warning label", () => {
    expect(getStateLabel("warning")).toBe("Warning");
  });

  it("returns Normal label", () => {
    expect(getStateLabel("normal")).toBe("Normal");
  });
});

describe("getProgressState", () => {
  describe("threshold boundaries", () => {
    it("returns normal for values below WARNING_THRESHOLD", () => {
      expect(getProgressState(0)).toBe("normal");
      expect(getProgressState(50)).toBe("normal");
      expect(getProgressState(69.99)).toBe("normal");
    });

    it("returns warning at exactly WARNING_THRESHOLD (70)", () => {
      expect(getProgressState(70)).toBe("warning");
    });

    it("returns warning for values between WARNING and CRITICAL", () => {
      expect(getProgressState(80)).toBe("warning");
      expect(getProgressState(89.99)).toBe("warning");
    });

    it("returns critical at exactly CRITICAL_THRESHOLD (90)", () => {
      expect(getProgressState(90)).toBe("critical");
    });

    it("returns critical for values above CRITICAL_THRESHOLD", () => {
      expect(getProgressState(95)).toBe("critical");
      expect(getProgressState(100)).toBe("critical");
    });
  });

  describe("edge cases", () => {
    it("handles negative values as normal", () => {
      expect(getProgressState(-10)).toBe("normal");
    });

    it("handles values above 100 as critical", () => {
      expect(getProgressState(150)).toBe("critical");
    });
  });
});

describe("getProgressColor", () => {
  it("returns success color for normal state", () => {
    expect(getProgressColor(50)).toBe("var(--success)");
  });

  it("returns warning color at WARNING_THRESHOLD", () => {
    expect(getProgressColor(70)).toBe("var(--warning)");
  });

  it("returns critical color at CRITICAL_THRESHOLD", () => {
    expect(getProgressColor(90)).toBe("var(--danger)");
  });
});

describe("getTempState", () => {
  describe("threshold boundaries", () => {
    it("returns normal below TEMP_WARNING_THRESHOLD (80)", () => {
      expect(getTempState(70)).toBe("normal");
      expect(getTempState(79.99)).toBe("normal");
    });

    it("returns warning at exactly TEMP_WARNING_THRESHOLD (80)", () => {
      expect(getTempState(80)).toBe("warning");
    });

    it("returns warning between WARNING and CRITICAL", () => {
      expect(getTempState(85)).toBe("warning");
      expect(getTempState(89.99)).toBe("warning");
    });

    it("returns critical at exactly TEMP_CRITICAL_THRESHOLD (90)", () => {
      expect(getTempState(90)).toBe("critical");
    });

    it("returns critical above TEMP_CRITICAL_THRESHOLD", () => {
      expect(getTempState(95)).toBe("critical");
      expect(getTempState(100)).toBe("critical");
    });
  });
});

describe("getTempColor", () => {
  it("returns success color for normal temperature", () => {
    expect(getTempColor(60)).toBe("var(--success)");
  });

  it("returns warning color at TEMP_WARNING_THRESHOLD", () => {
    expect(getTempColor(80)).toBe("var(--warning)");
  });

  it("returns danger color at TEMP_CRITICAL_THRESHOLD", () => {
    expect(getTempColor(90)).toBe("var(--danger)");
  });
});

describe("getStorageTempState", () => {
  describe("threshold boundaries", () => {
    it("returns normal below STORAGE_TEMP_WARNING_THRESHOLD (50)", () => {
      expect(getStorageTempState(40)).toBe("normal");
      expect(getStorageTempState(49.99)).toBe("normal");
    });

    it("returns warning at exactly STORAGE_TEMP_WARNING_THRESHOLD (50)", () => {
      expect(getStorageTempState(50)).toBe("warning");
    });

    it("returns warning between WARNING and CRITICAL", () => {
      expect(getStorageTempState(58)).toBe("warning");
      expect(getStorageTempState(64.99)).toBe("warning");
    });

    it("returns critical at exactly STORAGE_TEMP_CRITICAL_THRESHOLD (65)", () => {
      expect(getStorageTempState(65)).toBe("critical");
    });

    it("returns critical above STORAGE_TEMP_CRITICAL_THRESHOLD", () => {
      expect(getStorageTempState(70)).toBe("critical");
      expect(getStorageTempState(80)).toBe("critical");
    });
  });
});

describe("getStorageTempColor", () => {
  it("returns success color for normal storage temperature", () => {
    expect(getStorageTempColor(35)).toBe("var(--success)");
  });

  it("returns warning color at STORAGE_TEMP_WARNING_THRESHOLD", () => {
    expect(getStorageTempColor(50)).toBe("var(--warning)");
  });

  it("returns danger color at STORAGE_TEMP_CRITICAL_THRESHOLD", () => {
    expect(getStorageTempColor(65)).toBe("var(--danger)");
  });
});

describe("getProgressGradient", () => {
  beforeEach(() => {
    vi.spyOn(global, "setTimeout").mockImplementation((fn: Function) => fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("solid mode (default)", () => {
    beforeEach(() => {
      document.documentElement.setAttribute("data-accent-mode", "solid");
    });

    it("returns solid color for normal state", () => {
      expect(getProgressGradient(50)).toBe("var(--accent-primary)");
    });

    it("returns warning color at WARNING_THRESHOLD", () => {
      expect(getProgressGradient(70)).toBe("var(--warning)");
    });

    it("returns danger color at CRITICAL_THRESHOLD", () => {
      expect(getProgressGradient(90)).toBe("var(--danger)");
    });
  });

  describe("animated-gradient mode", () => {
    beforeEach(() => {
      document.documentElement.setAttribute(
        "data-accent-mode",
        "animated-gradient",
      );
    });

    it("returns gradient for normal state", () => {
      const result = getProgressGradient(50);
      expect(result).toContain("linear-gradient");
      expect(result).toContain("var(--accent-primary)");
    });

    it("returns gradient with warning color at WARNING_THRESHOLD", () => {
      const result = getProgressGradient(70);
      expect(result).toContain("linear-gradient");
      expect(result).toContain("var(--warning)");
    });

    it("returns gradient with danger color at CRITICAL_THRESHOLD", () => {
      const result = getProgressGradient(90);
      expect(result).toContain("linear-gradient");
      expect(result).toContain("var(--danger)");
    });
  });

  describe("rainbow-wave mode", () => {
    beforeEach(() => {
      document.documentElement.setAttribute("data-accent-mode", "rainbow-wave");
    });

    it("returns gradient for normal state", () => {
      const result = getProgressGradient(50);
      expect(result).toContain("linear-gradient");
      expect(result).toContain("var(--accent-primary)");
    });

    it("returns gradient with warning color at WARNING_THRESHOLD", () => {
      const result = getProgressGradient(70);
      expect(result).toContain("linear-gradient");
      expect(result).toContain("var(--warning)");
    });
  });
});
