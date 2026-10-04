"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslations, type MessageKey } from "@/i18n";
import { snapGridLabel } from "@/lib/measurementUnits";
import { publicPath } from "@/lib/publicPath";
import { TUTORIAL_TARGETS, TutorialCoachmarks, tutorialCoachParams, type TutorialTarget } from "@/components/workplane/TutorialCoachmarks";
import type { GridSize } from "@/types/sketchforge";

const NAMEPLATE_STEP_STORAGE_KEY = "sketchforge:nameplate-tutorial-step";

type TutorialDimension = {
  labelKey: MessageKey;
  millimeters: number;
  slider: number;
};

type TutorialStep = {
  titleKey: MessageKey;
  bodyKey: MessageKey;
  altKey: MessageKey;
  image: string;
  dimensions?: TutorialDimension[];
  snapGrid?: GridSize;
  calloutKey?: MessageKey;
  /** Controls framed on screen while the step is open. */
  targets?: readonly TutorialTarget[];
};

// Step 0 is the "Before you start" overview; step N is labelled "Step N".
const STEPS: TutorialStep[] = [
  {
    titleKey: "panels.nameplate.intro.title",
    bodyKey: "panels.nameplate.intro.body",
    altKey: "panels.nameplate.intro.alt",
    image: publicPath("/assets/challenges/nameplate/01-finished-target.webp"),
    targets: [TUTORIAL_TARGETS.snapGrid],
    snapGrid: "0.5 mm",
  },
  {
    titleKey: "panels.nameplate.base.title",
    bodyKey: "panels.nameplate.base.body",
    altKey: "panels.nameplate.base.alt",
    image: publicPath("/assets/challenges/nameplate/02-base-box.webp"),
    targets: [TUTORIAL_TARGETS.shapes],
    dimensions: [
      { labelKey: "panels.property.length", millimeters: 24, slider: 24 },
      { labelKey: "panels.property.width", millimeters: 70, slider: 70 },
      { labelKey: "panels.property.height", millimeters: 3, slider: 12 },
    ],
  },
  {
    titleKey: "panels.nameplate.round.title",
    bodyKey: "panels.nameplate.round.body",
    altKey: "panels.nameplate.round.alt",
    image: publicPath("/assets/challenges/nameplate/03-rounded-base.webp"),
    targets: [TUTORIAL_TARGETS.fillet],
    calloutKey: "panels.nameplate.round.callout",
  },
  {
    titleKey: "panels.nameplate.text.title",
    bodyKey: "panels.nameplate.text.body",
    altKey: "panels.nameplate.text.alt",
    image: publicPath("/assets/challenges/nameplate/04-text-added.webp"),
    targets: [TUTORIAL_TARGETS.shapes],
  },
  {
    titleKey: "panels.nameplate.personalize.title",
    bodyKey: "panels.nameplate.personalize.body",
    altKey: "panels.nameplate.personalize.alt",
    image: publicPath("/assets/challenges/nameplate/05-text-customized.webp"),
    dimensions: [
      { labelKey: "panels.property.height", millimeters: 2, slider: 9 },
    ],
  },
  {
    titleKey: "panels.nameplate.place.title",
    bodyKey: "panels.nameplate.place.body",
    altKey: "panels.nameplate.place.alt",
    image: publicPath("/assets/challenges/nameplate/05-text-customized.webp"),
    targets: [TUTORIAL_TARGETS.lift],
    dimensions: [
      { labelKey: "panels.tutorial.elevation", millimeters: 3, slider: 12 },
    ],
  },
  {
    titleKey: "panels.nameplate.center.title",
    bodyKey: "panels.nameplate.center.body",
    altKey: "panels.nameplate.center.alt",
    image: publicPath("/assets/challenges/nameplate/06-text-centered.webp"),
    targets: [TUTORIAL_TARGETS.lock, TUTORIAL_TARGETS.align, TUTORIAL_TARGETS.alignMiddleX, TUTORIAL_TARGETS.alignMiddleZ],
    calloutKey: "panels.nameplate.center.callout",
  },
  {
    titleKey: "panels.nameplate.group.title",
    bodyKey: "panels.nameplate.group.body",
    altKey: "panels.nameplate.group.alt",
    image: publicPath("/assets/challenges/nameplate/07-grouped-nameplate.webp"),
    targets: [TUTORIAL_TARGETS.group],
  },
];

function storedStepIndex() {
  if (typeof window === "undefined") return 0;
  const parsed = Number.parseInt(window.localStorage.getItem(NAMEPLATE_STEP_STORAGE_KEY) ?? "0", 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(STEPS.length - 1, parsed)) : 0;
}

export function NameplateTutorialPanel({
  onFinish,
  collapsed = false,
  onCollapsedChange,
}: {
  onFinish?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const t = useTranslations();
  const [stepIndex, setStepIndex] = useState(storedStepIndex);
  const step = STEPS[stepIndex];
  const first = stepIndex === 0;
  const last = stepIndex === STEPS.length - 1;

  const goToStep = (index: number) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, index));
    setStepIndex(next);
    window.localStorage.setItem(NAMEPLATE_STEP_STORAGE_KEY, String(next));
  };

  if (collapsed) {
    return (
      <aside className="key-tag-tutorial-panel key-tag-tutorial-panel-collapsed" aria-label={t("panels.nameplate.ariaLabel")}>
        <button
          type="button"
          className="key-tag-tutorial-expand"
          title={t("panels.tutorial.expand")}
          aria-label={t("panels.tutorial.expand")}
          onClick={() => onCollapsedChange?.(false)}
        >
          <ChevronLeft size={19} />
        </button>
        <span className="key-tag-tutorial-collapsed-label">{t("panels.nameplate.shortTitle")}</span>
        <span className="key-tag-tutorial-collapsed-count">{stepIndex + 1}/{STEPS.length}</span>
      </aside>
    );
  }

  return (
    <>
      {step.targets ? <TutorialCoachmarks targets={step.targets} params={tutorialCoachParams(t, step)} /> : null}
      <aside
        className="key-tag-tutorial-panel"
        aria-label={t("panels.nameplate.ariaLabel")}
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
      <header className="key-tag-tutorial-header">
        <div>
          <span>{t("panels.tutorial.challenge", { number: 2 })}</span>
          <strong>{t("panels.nameplate.title")}</strong>
        </div>
        <div className="key-tag-tutorial-header-actions">
          <span className="key-tag-tutorial-count">{stepIndex + 1} / {STEPS.length}</span>
          <button
            type="button"
            className="key-tag-tutorial-collapse"
            title={t("panels.tutorial.minimize")}
            aria-label={t("panels.tutorial.minimize")}
            onClick={() => onCollapsedChange?.(true)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      <div className="key-tag-tutorial-body">
        <div className="key-tag-tutorial-copy">
          <span className="key-tag-tutorial-eyebrow">{first ? t("panels.tutorial.beforeStart") : t("panels.tutorial.step", { number: stepIndex })}</span>
          <h2>{t(step.titleKey)}</h2>
          <p>{t(step.bodyKey)}</p>

          {step.snapGrid ? (
            <div className="key-tag-snap-row" aria-label={t("panels.tutorial.snapGridValue", { value: snapGridLabel(t, step.snapGrid) })}>
              <span>{t("panels.snapGrid.label")}</span>
              <strong>{snapGridLabel(t, step.snapGrid)}</strong>
            </div>
          ) : null}

          {step.calloutKey ? <div className="nameplate-tutorial-callout">{t(step.calloutKey)}</div> : null}

          {step.dimensions ? (
            <div className="key-tag-tutorial-dimensions" aria-label={t("panels.tutorial.requiredDimensions")}>
              {step.dimensions.map((dimension) => (
                <div className="key-tag-tutorial-dimension-control" key={dimension.labelKey}>
                  <div className="key-tag-tutorial-dimension-heading">
                    <span>{t(dimension.labelKey)}</span>
                    <strong>{t("panels.unit.millimeters", { value: dimension.millimeters.toFixed(2) })}</strong>
                  </div>
                  <div className="key-tag-tutorial-slider" aria-hidden="true">
                    <span style={{ width: `${dimension.slider}%` }} />
                    <i style={{ left: `${dimension.slider}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="key-tag-tutorial-image-box">
          <img className="key-tag-tutorial-capture" src={step.image} alt={t(step.altKey)} draggable={false} />
        </div>
      </div>

      <footer className="key-tag-tutorial-footer">
        <button type="button" className="secondary" disabled={first} onClick={() => goToStep(stepIndex - 1)}>
          <ChevronLeft size={17} /> {t("panels.tutorial.previous")}
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            if (last) {
              window.localStorage.removeItem(NAMEPLATE_STEP_STORAGE_KEY);
              onFinish?.();
              return;
            }
            goToStep(stepIndex + 1);
          }}
        >
          {last ? t("panels.tutorial.finish") : t("panels.tutorial.next")} {!last ? <ChevronRight size={17} /> : null}
        </button>
      </footer>
      </aside>
    </>
  );
}
