import type { CSSProperties } from "react";

/** Window-wake delay as an inline CSS var (consumed by the .win animation). */
const wd = (s: number) => ({ "--wd": `${s}s` }) as CSSProperties;

/**
 * The dusk scene — the manor itself is the hero. A fixed painting behind the
 * lobby screens: moonlit sky, the manor silhouette whose windows wake one by
 * one (someone is home), two drifting fog banks, and a dark ground that seats
 * the content. Pure gradients + one hand-drawn SVG; mirrors the artifact's
 * lobby scene exactly. Nothing lit sits in the tower/connector band — it hides
 * behind the content panels, whose backdrop blur would smear the light into
 * smudges across the text.
 */
export function DuskScene() {
  return (
    <div className="dusk" aria-hidden="true">
      <div className="dusk-sky" />
      <svg className="dusk-manor" viewBox="0 0 1200 360" focusable="false">
        {/* skyline: left gabled wing · connector · central tower · dormered
            connector · right gabled wing */}
        <path
          className="bldg"
          d="M100 360 V208 L130 208 L215 132 L300 208 L330 208 V228 L520 228 V152 L600 44 L680 152 V228 L745 228 L775 192 L805 228 L870 228 V208 L900 208 L985 136 L1070 208 L1100 208 V360 Z"
        />
        <rect className="bldg" x={150} y={100} width={16} height={100} />
        <rect className="bldg" x={1035} y={104} width={16} height={90} />
        <rect className="bldg" x={597} y={20} width={6} height={26} />
        <circle className="bldg" cx={600} cy={17} r={3.5} />
        {/* base mass below the viewBox (svg overflow:visible) — the silhouette
            melts into the ground fade instead of ending in a straight seam */}
        <rect className="bldg" x={-150} y={358} width={1500} height={400} />
        {/* the windows wake in no particular order; two can't hold still */}
        <rect className="win" style={wd(3.4)} x={150} y={230} width={14} height={22} />
        <rect className="win" style={wd(1.8)} x={205} y={230} width={14} height={22} />
        <rect className="win" style={wd(4.6)} x={258} y={230} width={14} height={22} />
        <rect className="win wf" style={wd(5.4)} x={208} y={158} width={14} height={18} />
        <rect className="win" style={wd(2.2)} x={920} y={230} width={14} height={22} />
        <rect className="win" style={wd(4.1)} x={975} y={230} width={14} height={22} />
        <rect className="win wf" style={wd(1.5)} x={1028} y={230} width={14} height={22} />
        <rect className="win" style={wd(3.8)} x={978} y={162} width={14} height={18} />
      </svg>
      <div className="dusk-fog f1" />
      <div className="dusk-fog f2" />
      <div className="dusk-ground" />
    </div>
  );
}
