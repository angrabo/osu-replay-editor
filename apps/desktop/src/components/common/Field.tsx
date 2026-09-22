import { ChevronDown } from 'lucide-react';

export function Field({
  label,
  value,
  select,
  positive,
}: {
  label: string;
  value: string;
  select?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="field-row">
      <span>{label}</span>
      <div className={`field-value ${positive ? 'positive' : ''}`}>
        {value}
        {select && <ChevronDown size={13} />}
      </div>
    </div>
  );
}
