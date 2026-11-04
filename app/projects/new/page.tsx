import Link from "next/link";

export default function NewProjectPage() {
  return (
    <main className="doors-page">
      <h1 className="big" style={{ fontSize: "clamp(34px, 4.2vw, 60px)" }}>
        Start a new story
      </h1>
      <p className="lede" style={{ marginTop: 12 }}>
        Bring what you have, or begin with an idea.
      </p>
      <div className="doors" style={{ marginTop: 22 }}>
        <Link className="pill" href="/projects/new/material">
          I already have material
        </Link>
        <Link className="pill light" href="/projects/new/idea">
          I have an idea
        </Link>
      </div>
    </main>
  );
}
