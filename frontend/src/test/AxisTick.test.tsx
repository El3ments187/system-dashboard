import { render } from "@testing-library/react";
import { AxisTick } from "../charts/AxisTick";

function Harness({ label }: { label: string }) {
  return (
    <svg>
      {AxisTick({
        x: 10,
        y: 20,
        payload: { value: 0 },
        textAnchor: "middle",
        verticalAnchor: "start",
        index: 0,
        tickFormatter: () => label,
      })}
    </svg>
  );
}

it("renders a plain <text> with the formatted label and no <tspan>", () => {
  const { container } = render(<Harness label="21:51:40" />);
  const text = container.querySelector("text");
  expect(text).not.toBeNull();
  expect(container.querySelector("tspan")).toBeNull();
  expect(text?.textContent).toBe("21:51:40");
});

it("reuses the same <text> DOM node when the label changes (no detach)", () => {
  const { container, rerender } = render(<Harness label="21:51:40" />);
  const before = container.querySelector("text");
  rerender(<Harness label="21:51:41" />);
  const after = container.querySelector("text");
  expect(after).toBe(before); // same node, reconciled in place
  expect(after?.textContent).toBe("21:51:41");
});

it("maps verticalAnchor to dominant-baseline", () => {
  const mk = (va: string) =>
    render(
      <svg>
        {AxisTick({ x: 0, y: 0, payload: { value: 0 }, verticalAnchor: va })}
      </svg>,
    ).container.querySelector("text");
  expect(mk("start")?.getAttribute("dominant-baseline")).toBe("hanging");
  expect(mk("middle")?.getAttribute("dominant-baseline")).toBe("central");
  expect(mk("end")?.getAttribute("dominant-baseline")).toBe("auto");
});
