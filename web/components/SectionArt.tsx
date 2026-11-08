import { Sprig } from "./nature";

/**
 * Sections where decoration could pull the eye away from the task stay
 * plain: the tile board, eye-gaze calibration and typing, camera gesture
 * teaching, and the service request board.
 */
export const QUIET_SECTIONS = new Set(["speak", "calibrate", "type-eyes", "type", "teach", "services"]);

/**
 * A eucalyptus sprig beside the greeting on the resident home screen.
 * Other sections keep their top-right corner for their own actions.
 */
export function SectionArt({ section }: { section: string }) {
  if (section !== "") return null;
  return (
    <div className="section-art">
      <Sprig />
    </div>
  );
}
