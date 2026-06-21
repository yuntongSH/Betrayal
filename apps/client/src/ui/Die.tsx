/** A single rendered face of the signature {0,1,2} die. */
export function Die({ v }: { v: number }) {
  return <span className={`die d${v}`}>{v}</span>;
}

export function DiceRow({ dice }: { dice?: number[] }) {
  if (!dice || dice.length === 0) return null;
  return (
    <span className="dice-row">
      {dice.map((v, i) => (
        <Die key={i} v={v} />
      ))}
    </span>
  );
}
