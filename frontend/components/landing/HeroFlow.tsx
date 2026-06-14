"use client";

import { useEffect, useRef } from "react";

// Hero backdrop — a calm field of flowing lines (Canvas 2D, no WebGL).
//
// Slow, undulating horizontal lines on the dark ink stage, warm-paper coloured,
// with one amber line gliding through — like contour lines, or pages, or a
// highlighted passage. It reads as "a calm library": layered, breathing, never
// busy. Strictly ink-paper-amber.
//
// Why Canvas 2D and not the old R3F particle field: lighter (no three.js in the
// bundle), buttery at 60fps for line work, runs a gentle version on phones too,
// and sidesteps the over-used particle look. Reduced motion → one static frame.
export default function HeroFlow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;

    // Colours from the design tokens (constants on :root) — never hardcoded hex.
    const root = getComputedStyle(document.documentElement);
    const paper = (root.getPropertyValue("--paper") || "#f5f1e8").trim();
    const amber = (root.getPropertyValue("--accent") || "#e8c87e").trim();

    let w = 0;
    let h = 0;
    let lineCount = 20;
    // Eased cursor influence so it's soothing, never snappy.
    const pointer = { x: 0, y: 0, active: false, strength: 0 };

    // Arrow functions (not hoisted `function`) so TS keeps the non-null
    // narrowing of `canvas`/`ctx` inside these closures.
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lineCount = w < 700 ? 13 : 20; // fewer lines on phones
    };
    resize();

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const breathe = 1 + 0.13 * Math.sin(t * 0.00007); // whole field breathes
      const amberPos = 0.7; // amber line sits below the headline, clearly visible
      const step = Math.max(7, w / 130);

      for (let i = 0; i < lineCount; i++) {
        const pos = (i + 1) / (lineCount + 1); // 0..1 down the stage
        const yBase = pos * h;
        // Calmer + fainter through the middle (behind the headline), more
        // present toward the top/bottom edges — the text parts the currents.
        const edge = Math.abs(Math.cos(pos * Math.PI)); // 1 at edges, 0 centre
        const amp = h * 0.02 * (0.5 + 0.5 * edge) * breathe;
        const phase = i * 0.55;

        ctx.beginPath();
        for (let x = -step; x <= w + step; x += step) {
          let y =
            yBase +
            amp * Math.sin(x * 0.0016 + t * 0.00018 + phase) +
            amp * 0.5 * Math.sin(x * 0.0009 - t * 0.00012 + phase * 1.3);
          if (pointer.strength > 0.01) {
            const dx = x - pointer.x; // gentle gaussian swell toward the cursor
            const g = Math.exp(-(dx * dx) / (2 * 110 * 110));
            y += (pointer.y - yBase) * 0.16 * g * pointer.strength;
          }
          if (x <= -step) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        const isAmber = Math.abs(pos - amberPos) < 0.5 / (lineCount + 1);
        if (isAmber) {
          ctx.strokeStyle = amber;
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = 1.6;
          ctx.shadowColor = amber;
          ctx.shadowBlur = 12;
        } else {
          ctx.strokeStyle = paper;
          ctx.globalAlpha = 0.08 + 0.12 * edge; // fainter in the calm centre
          ctx.lineWidth = 1;
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    };

    let raf = 0;
    let running = false;
    const loop = (now: number) => {
      pointer.strength += ((pointer.active ? 1 : 0) - pointer.strength) * 0.05;
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    if (reduce) draw(9000); // a pleasant settled frame, no animation
    else start();

    // Cursor influence — desktop pointers only, scoped to the hero stage.
    const stage = document.getElementById("hero-stage");
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
    };
    const onLeave = () => {
      pointer.active = false;
    };
    if (!reduce && finePointer && stage) {
      stage.addEventListener("mousemove", onMove);
      stage.addEventListener("mouseleave", onLeave);
    }

    // Pause the loop while the hero is off-screen (perf / battery).
    const io = new IntersectionObserver(
      ([entry]) => {
        if (reduce) return;
        if (entry.isIntersecting) start();
        else stop();
      },
      { threshold: 0 }
    );
    io.observe(canvas);

    const onResize = () => {
      resize();
      if (reduce) draw(9000);
    };
    window.addEventListener("resize", onResize);

    return () => {
      stop();
      io.disconnect();
      window.removeEventListener("resize", onResize);
      if (stage) {
        stage.removeEventListener("mousemove", onMove);
        stage.removeEventListener("mouseleave", onLeave);
      }
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />;
}
