"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceTake = {
  lineIndex: number;
  blob: Blob;
  url: string;
  seconds: number;
};

type Props = {
  lines: string[];
  onChange: (takes: VoiceTake[]) => void;
};

function preferredMime(): string {
  try {
    if (typeof MediaRecorder === "undefined") return "";
    if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
    if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  } catch {
    // Fall through to the browser default.
  }
  return "";
}

function formatLength(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = Math.round(total % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function lengthHint(total: number, count: number): string {
  if (count === 0) return "Read each line as the character would.";
  if (total < 10) return "Record at least 10 seconds before continuing.";
  if (total < 60) return "One to two minutes works best.";
  if (total > 180) return "Three minutes is plenty.";
  return "That should be plenty.";
}

/**
 * One shared recorder for the Characters drawer and the voice-artist
 * page. One line at a time: the line shown large, Record, Stop,
 * Play back, Retake, Next, plus a level meter and an upload option.
 */
export default function Recorder({ lines, onChange }: Props) {
  const [index, setIndex] = useState(0);
  const [takes, setTakes] = useState<Record<number, VoiceTake>>({});
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [level, setLevel] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterTimerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const totalSeconds = Object.values(takes).reduce((sum, take) => sum + take.seconds, 0);

  const supported =
    typeof window !== "undefined" && typeof (window as unknown as { MediaRecorder?: unknown }).MediaRecorder !== "undefined";

  const stopMeter = useCallback(() => {
    if (meterTimerRef.current !== null) {
      window.clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
    setLevel(0);
    try {
      audioCtxRef.current?.close().catch(() => {});
    } catch {
      // Closing twice is fine to ignore.
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(
    () => () => {
      try {
        recorderRef.current?.state === "recording" && recorderRef.current.stop();
      } catch {
        // Tearing down; ignore.
      }
      stopMeter();
      stopStream();
      audioRef.current?.pause();
      for (const take of Object.values(takes)) URL.revokeObjectURL(take.url);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const measureSeconds = async (blob: Blob): Promise<number> => {
    try {
      const Ctx = window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return 0;
      const ctx = new Ctx();
      const buffer = await blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buffer);
      const seconds = decoded.duration;
      await ctx.close().catch(() => {});
      return Number.isFinite(seconds) ? seconds : 0;
    } catch {
      return 0;
    }
  };

  const setTake = (lineIndex: number, take: VoiceTake | null) => {
    setTakes((prev) => {
      const old = prev[lineIndex];
      if (old) URL.revokeObjectURL(old.url);
      const next = { ...prev };
      if (take) next[lineIndex] = take;
      else delete next[lineIndex];
      onChange(Object.values(next).sort((a, b) => a.lineIndex - b.lineIndex));
      return next;
    });
  };

  const startMeter = (stream: MediaStream) => {
    try {
      const Ctx = window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.fftSize);
      meterTimerRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) {
          const centred = (value - 128) / 128;
          sum += centred * centred;
        }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 3));
      }, 100);
    } catch {
      // The meter is a nicety; recording works without it.
    }
  };

  const record = async () => {
    if (recording) return;
    setProblem(null);
    setPlaying(false);
    audioRef.current?.pause();
    if (!supported) {
      setProblem("This browser can't record. Upload a recording instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const mimeType = preferredMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void (async () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          stopMeter();
          stopStream();
          const seconds = await measureSeconds(blob);
          setRecording(false);
          if (blob.size === 0) {
            setProblem("Nothing was recorded. Try again.");
            return;
          }
          setTake(index, { lineIndex: index, blob, url: URL.createObjectURL(blob), seconds });
        })();
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      startMeter(stream);
    } catch {
      stopMeter();
      stopStream();
      setRecording(false);
      setProblem("The microphone is blocked. Allow it, or upload a recording instead.");
    }
  };

  const stop = () => {
    try {
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
    } catch {
      setRecording(false);
      stopMeter();
      stopStream();
    }
  };

  const playBack = () => {
    const take = takes[index];
    if (!take) return;
    let el = audioRef.current;
    if (!el) {
      el = new Audio();
      el.onended = () => setPlaying(false);
      audioRef.current = el;
    }
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    try {
      el.src = take.url;
      el.play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    } catch {
      setPlaying(false);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    const seconds = await measureSeconds(file);
    setTake(index, { lineIndex: index, blob: file, url: URL.createObjectURL(file), seconds });
  };

  const take = takes[index];
  const line = lines[index] ?? "";
  const bars = Array.from({ length: 14 }, (_, i) => i);

  return (
    <div>
      <div className="vx-line">
        <div className="vx-sub">
          Line {lines.length === 0 ? 0 : index + 1} of {lines.length}
        </div>
        <q>{line || "No lines yet."}</q>
        <div className={`vx-meter${recording ? " vx-recording" : ""}`} aria-hidden>
          {bars.map((i) => (
            <i
              key={i}
              style={recording ? { height: 5 + level * 23 * ((i % 5) + 1) * 0.28 } : undefined}
            />
          ))}
        </div>
        <div className="row" style={{ justifyContent: "center" }}>
          {recording ? (
            <button type="button" className="pill rec" onClick={stop}>
              Stop
            </button>
          ) : (
            <button type="button" className="pill rec" onClick={() => void record()}>
              Record
            </button>
          )}
          <button type="button" className="pill light" onClick={playBack} disabled={!take}>
            {playing ? "Stop" : "Play back"}
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => take && setTake(index, null)}
            disabled={!take}
          >
            Retake
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => setIndex((i) => Math.min(lines.length - 1, i + 1))}
            disabled={index >= lines.length - 1}
          >
            Next line
          </button>
        </div>
      </div>
      <div className="vx-prog">
        <span>
          {formatLength(totalSeconds)} recorded · {Object.keys(takes).length} of {lines.length} lines
        </span>
        <span>{lengthHint(totalSeconds, Object.keys(takes).length)}</span>
      </div>
      {problem && (
        <div className="artstate">
          <p>{problem}</p>
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <label className="quiet" style={{ display: "inline-block" }}>
          Upload a recording instead
          <input
            type="file"
            accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4"
            style={{ display: "block", marginTop: 6 }}
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </label>
        <div className="vx-sub" style={{ marginTop: 4 }}>
          MP3, WAV or M4A.
        </div>
      </div>
    </div>
  );
}
