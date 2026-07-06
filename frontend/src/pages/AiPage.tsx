import OpenCodeCard from "../components/cards/OpenCodeCard";
import OpenWebUICard from "../components/cards/OpenWebUICard";
import ComfyUICard from "../components/cards/ComfyUICard";

export default function AiPage() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        gap: 6,
        padding: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateRows: "repeat(3, 1fr)",
          gap: 6,
          flex: 1,
          minHeight: 0,
        }}
      >
        <div style={{ minHeight: 0, display: "flex" }}>
          <OpenCodeCard />
        </div>
        <div style={{ minHeight: 0, display: "flex" }}>
          <OpenWebUICard />
        </div>
        <div style={{ minHeight: 0, display: "flex" }}>
          <ComfyUICard />
        </div>
      </div>
    </main>
  );
}
