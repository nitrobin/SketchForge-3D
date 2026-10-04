"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useT, type MessageKey, type MessageParams, type Translator } from "@/i18n";
import { snapGridLabel } from "@/lib/measurementUnits";
import type { GridSize } from "@/types/sketchforge";

/** A control a tutorial step points at: framed, and labelled when `labelKey` is set. */
export type TutorialTarget = {
  selector: string;
  labelKey?: MessageKey;
};

/** Controls the challenges point at. Toolbar buttons and the shape lock carry `data-sketchforge-tool`. */
export const TUTORIAL_TARGETS = {
  snapGrid: { selector: ".snap-select", labelKey: "panels.tutorial.coach.snapGrid" },
  shapes: { selector: ".shape-menu-trigger", labelKey: "panels.tutorial.coach.shapes" },
  duplicate: { selector: 'button[data-sketchforge-tool="duplicate"]', labelKey: "panels.tutorial.coach.duplicate" },
  lock: { selector: 'button[data-sketchforge-tool="lock"]', labelKey: "panels.tutorial.coach.lock" },
  hole: { selector: "button.hole-choice", labelKey: "panels.tutorial.coach.hole" },
  align: { selector: 'button[data-sketchforge-tool="align"]', labelKey: "panels.tutorial.coach.align" },
  // The middle dots of the two alignment lines that lie on the grid; shown after Align is pressed.
  alignMiddleX: { selector: ".align-dot.axis-x.target-center" },
  alignMiddleZ: { selector: ".align-dot.axis-z.target-center" },
  fillet: { selector: 'button[data-sketchforge-tool="fillet"]', labelKey: "panels.tutorial.coach.fillet" },
  group: { selector: 'button[data-sketchforge-tool="group"]', labelKey: "panels.tutorial.coach.group" },
  lift: { selector: "button.transform-handle.height-lift", labelKey: "panels.tutorial.coach.lift" },
} as const satisfies Record<string, TutorialTarget>;

type Mark = { key: string; left: number; top: number; above: boolean; labelKey: MessageKey };

type StepValues = {
  snapGrid?: GridSize;
  dimensions?: readonly { labelKey: MessageKey; millimeters: number }[];
};

/** Values the labels show ({snapGrid}, {elevation}), taken from the step so label and step data agree. */
export function tutorialCoachParams(t: Translator, step: StepValues): MessageParams {
  const elevation = step.dimensions?.find((dimension) => dimension.labelKey === "panels.tutorial.elevation");
  return {
    snapGrid: step.snapGrid ? snapGridLabel(t, step.snapGrid) : "",
    elevation: elevation ? String(elevation.millimeters) : "",
  };
}

const LABEL_GAP = 42;
const LABEL_HEIGHT = 48;
const LABEL_HALF_WIDTH = 100;

function visibleElement(selector: string) {
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight) return element;
  }
  return null;
}

function frame(element: HTMLElement) {
  if (element.classList.contains("tutorial-target")) return;
  element.classList.add("tutorial-target");
  // Raising a static element keeps its frame above its neighbours; positioned ones (align dots,
  // transform handles) keep their own positioning.
  if (getComputedStyle(element).position === "static") element.classList.add("tutorial-target-raised");
}

function unframe(element: HTMLElement) {
  element.classList.remove("tutorial-target", "tutorial-target-raised");
}

/**
 * Frames the controls a tutorial step talks about and labels them. Targets are looked up on every
 * animation frame because some appear only later (align dots, the lift arrow of a selected shape)
 * or move with the camera; state changes only when a frame or label moves.
 */
export function TutorialCoachmarks({ targets, params }: { targets: readonly TutorialTarget[]; params?: MessageParams }) {
  const t = useT();
  const [marks, setMarks] = useState<Mark[]>([]);

  useEffect(() => {
    let request = 0;
    let framed: HTMLElement[] = [];
    let previous = "";
    const update = () => {
      const found = targets.map((target) => ({ target, element: visibleElement(target.selector) }));
      const elements = found.flatMap(({ element }) => (element ? [element] : []));
      framed.filter((element) => !elements.includes(element)).forEach(unframe);
      // Re-applied every frame: React rewrites `class` when a button re-renders (e.g. becomes active).
      elements.forEach(frame);
      framed = elements;

      const next = found.flatMap(({ target, element }, index) => {
        if (!element || !target.labelKey) return [];
        const rect = element.getBoundingClientRect();
        const above = rect.bottom + LABEL_GAP + LABEL_HEIGHT > window.innerHeight;
        const center = rect.left + rect.width / 2;
        return [{
          key: String(index),
          left: Math.round(Math.min(Math.max(center, LABEL_HALF_WIDTH), window.innerWidth - LABEL_HALF_WIDTH)),
          top: Math.round(above ? rect.top - LABEL_GAP : rect.bottom + LABEL_GAP),
          above,
          labelKey: target.labelKey,
        }];
      });
      const signature = JSON.stringify(next);
      if (signature !== previous) {
        previous = signature;
        setMarks(next);
      }
      request = window.requestAnimationFrame(update);
    };
    request = window.requestAnimationFrame(update);
    return () => {
      window.cancelAnimationFrame(request);
      framed.forEach(unframe);
    };
  }, [targets]);

  return (
    <>
      {marks.map((mark) => (
        <div key={mark.key} className={`tutorial-coachmark${mark.above ? " above" : ""}`} style={{ left: mark.left, top: mark.top }} role="status">
          {mark.above ? <ArrowDown size={30} strokeWidth={3} aria-hidden="true" /> : <ArrowUp size={30} strokeWidth={3} aria-hidden="true" />}
          <strong>{t(mark.labelKey, params)}</strong>
        </div>
      ))}
    </>
  );
}
