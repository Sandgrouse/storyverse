import { createLocalStorage } from "@/lib/storage/local";
import { RippleResultSchema } from "@/lib/world/schemas";
import rippleFixture from "@/data/seed/saltlight-ripple.json";

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export default async function PackagePage() {
  const world = await createLocalStorage().getWorld();
  const gameChannel = world.channels.find((c) => c.kind === "game");
  const gameChannelId = gameChannel?.id;
  const channelName = (id: string) =>
    world.channels.find((c) => c.id === id)?.name.toLowerCase() ?? "another channel";

  const gameBeats = world.beats
    .filter((b) => b.channelId === gameChannelId)
    .sort((a, b) => a.order - b.order);

  const lines: string[] = [
    `${world.id}-game/`,
    "├─ AGENT_BRIEF.md",
    "├─ manifest.json",
    "├─ canon/",
    "│  ├─ world.md",
    "│  ├─ timeline.json",
    "│  └─ secrets.json       game players only",
    "├─ characters/",
  ];
  world.characters.forEach((c, i) => {
    const last = i === world.characters.length - 1;
    const conn = last ? "└─" : "├─";
    const pad = last ? "   " : "│  ";
    lines.push(`│  ${conn} ${c.id}/`);
    lines.push(`│  ${pad}├─ sheet/           front, left, right, back, poses`);
    lines.push(`│  ${pad}└─ cutouts/         SAM 3.1 transparent PNGs`);
  });
  lines.push("└─ levels/");
  gameBeats.forEach((b, i) => {
    const conn = i === gameBeats.length - 1 ? "└─" : "├─";
    lines.push(`   ${conn} ${String(b.order).padStart(2, "0")}-${b.id}.md`);
  });

  const known = world.secrets.filter((s) =>
    gameChannelId ? s.knownThrough.includes(gameChannelId) : false,
  );
  const hidden = world.secrets.filter(
    (s) => !(gameChannelId && s.knownThrough.includes(gameChannelId)),
  );
  const knownSentence =
    known.length > 0
      ? `Players can learn that ${known.map((s) => lowerFirst(s.text)).join(", and that ")}.`
      : "Players start knowing nothing.";
  const hiddenSentences = hidden.map(
    (s) =>
      `They must not learn that ${lowerFirst(s.text)}, because that belongs to the ${channelName(s.knownThrough[0] ?? "")}.`,
  );

  // Temporary until ripple results persist server-side: the brief quotes the
  // seeded fixture's game fix, matching the prototype's callout.
  const ripple = RippleResultSchema.parse(rippleFixture);
  const gameFix = ripple.fixes.find((f) => f.regeneratesImage);

  return (
    <div className="view">
      <div className="page">
        <div className="eyebrow">Hand off to any coding agent</div>
        <h1>Game package</h1>
        <div className="pkg">
          <div className="tree">
            <b>{lines[0]}</b>
            {`\n${lines.slice(1).join("\n")}`}
          </div>
          <div className="brief">
            <div className="eyebrow">AGENT_BRIEF.md</div>
            <h3>Build what the player may know, and nothing more</h3>
            <p>
              {knownSentence} {hiddenSentences.join(" ")}
            </p>
            {gameFix && (
              <div className="changed">
                Changed by the last ripple: {gameFix.proposal}
              </div>
            )}
            <div className="acts" style={{ marginTop: "14px" }}>
              <button
                className="ok"
                type="button"
                disabled
                title="Coming in a later task"
                style={{
                  background: "var(--lamp)",
                  borderColor: "var(--lamp)",
                  color: "#201704",
                  fontWeight: 600,
                  height: 42,
                }}
              >
                Export package
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
