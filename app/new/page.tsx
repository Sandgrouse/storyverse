import { createLocalStorage } from "@/lib/storage/local";

const STEPS = [
  { label: "Canon: characters, places, timeline, secrets", model: "muse-spark-1.3", go: true },
  { label: "Channel plan: who reveals what", model: "muse-spark-1.3", go: false },
  { label: "Character sheets", model: "muse-image-1.0", go: false },
  { label: "Scene images and cutouts", model: "muse-image-1.0, sam-3.1", go: false },
];

export default async function NewWorldPage() {
  const world = await createLocalStorage().getWorld();
  return (
    <div className="view">
      <div className="page">
        <div className="start">
          <div className="eyebrow">Start a world</div>
          <h1>What&apos;s the story?</h1>
          <textarea aria-label="Story premise" defaultValue={world.premise} />
          <button className="btn" type="button" disabled title="Coming in a later task">
            Build the world
          </button>
          <ol className="steps">
            {STEPS.map((step) => (
              <li key={step.label} className={step.go ? "go" : ""}>
                <span>{step.label}</span>
                <span>{step.model}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
