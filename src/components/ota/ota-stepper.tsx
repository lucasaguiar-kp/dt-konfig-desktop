import { Check } from "lucide-react";

type OtaStepperProps = {
  steps: string[];
  current: number;
};

export function OtaStepper({ steps, current }: OtaStepperProps) {
  return (
    <ol className="ota-stepper" aria-label="Etapas do OTA">
      {steps.map((label, index) => {
        const state = index < current ? "done" : index === current ? "active" : "todo";

        return (
          <li key={label} className={`ota-step ota-step-${state}`} aria-current={state === "active" ? "step" : undefined}>
            <span className="ota-step-marker">
              {state === "done" ? <Check size={13} aria-hidden="true" /> : index + 1}
            </span>
            <span className="ota-step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
