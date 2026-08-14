import type { TrafficLight } from "../types";
import { lightLabel, lightShort } from "../lib/status";

type Props = {
  light: TrafficLight;
  size?: "sm" | "md";
  showText?: boolean;
  short?: boolean;
};

export function StatusLight({
  light,
  size = "md",
  showText = true,
  short = false,
}: Props) {
  return (
    <span className={`status-light is-${light} is-${size}`}>
      <span className="status-dot" aria-hidden="true" />
      {showText ? (
        <span className="status-text">{short ? lightShort(light) : lightLabel(light)}</span>
      ) : null}
    </span>
  );
}
