"use client";

type Props = {
  active: boolean;
  onBack: () => void;
  onBegin: () => void;
};

export default function IdeaScene({ active, onBack, onBegin }: Props) {
  return (
    <section className={`scene${active ? " on" : ""}`} id="idea">
      <div className="logo">Storyverse</div>
      <div className="hello">
        <h1 className="big" style={{ fontSize: "clamp(34px, 4vw, 58px)" }}>
          What&rsquo;s the story you can&rsquo;t stop thinking about?
        </h1>
        <p className="lede" style={{ marginTop: 14, minHeight: 0 }}>
          A sentence is enough. I&rsquo;ll ask a few questions and build the
          world with you.
        </p>
        <form
          className="ask"
          style={{
            position: "relative",
            left: "auto",
            bottom: "auto",
            transform: "none",
            margin: "26px auto 0",
          }}
          onSubmit={(e) => {
            e.preventDefault();
            onBegin();
          }}
        >
          <input aria-label="Your idea" placeholder="A sentence is enough" autoComplete="off" />
          <button type="submit">Begin</button>
        </form>
        <div style={{ marginTop: 14 }}>
          <button className="quiet" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </section>
  );
}
