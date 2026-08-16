/**
 * The one place that decides how a figure is coloured. Every table cell on the
 * dashboard goes through `cellTone`, so "red means a missed target" holds
 * everywhere or nowhere.
 *
 *   ok       target met                      ink figure, green dot
 *   bad      target missed                   red figure, red dot
 *   neutral  no target                       ink figure, no dot
 *   na       the check never ran             faint "—", title "not measured"
 *   nm       zero the check cannot produce   faint "0" + n/m tag
 *
 * `na` wins over everything: a run that never looked has no value to colour.
 * `nm` wins over `ok`: Insureon reads 0 on button-name because its buttons are
 * <div>s the rule cannot fire on, and green there is the false clean this
 * tool exists to refuse.
 */
export type CellTone = 'ok' | 'bad' | 'neutral' | 'na' | 'nm';

export function cellTone(input: {
  value: number;
  target: number | null;
  higherIsBetter?: boolean;
  notMeasured?: boolean;
  misleadingZero?: boolean;
}): CellTone {
  if (input.notMeasured) return 'na';
  if (input.misleadingZero) return 'nm';
  if (input.target === null) return 'neutral';
  const met = input.higherIsBetter ? input.value >= input.target : input.value <= input.target;
  return met ? 'ok' : 'bad';
}

/** `7/10` for coverage-style rows, a plain count otherwise. */
export function formatCount(value: number, target: number | null, higherIsBetter = false): string {
  if (higherIsBetter && target !== null) return `${value}/${target}`;
  return value.toLocaleString();
}

export const NOT_MEASURED_TITLE = 'Not measured — this run never ran the check. Absence, not zero.';
export const NOT_MEASURABLE_TITLE =
  "Not measurable on this site's markup — the control is a <div>, so the rule cannot fire on it. It is still nameless.";
