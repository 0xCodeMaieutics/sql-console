import { useEffect, useState, type FormEvent } from "react";
import { FILTER_OPERATORS, type FilterOperator, type RowFilter } from "../../shared/types";

const takesValue = (operator: FilterOperator) => operator !== "is null" && operator !== "is not null";

const sameFilters = (a: RowFilter[], b: RowFilter[]) => JSON.stringify(a) === JSON.stringify(b);

export function FilterBar({
  columns,
  defaultColumn,
  filters,
  onApply,
}: {
  columns: string[];
  /** The column a newly added filter starts on, e.g. the first primary key column. */
  defaultColumn?: string;
  filters: RowFilter[];
  onApply: (filters: RowFilter[]) => void;
}) {
  const [draft, setDraft] = useState(filters);
  useEffect(() => setDraft(filters), [filters]);

  const update = (index: number, change: Partial<RowFilter>) =>
    setDraft(draft.map((filter, i) => (i === index ? { ...filter, ...change } : filter)));

  const add = () =>
    setDraft([...draft, { column: defaultColumn ?? columns[0] ?? "", operator: "=", value: "" }]);

  const remove = (index: number) => {
    const next = draft.filter((_, i) => i !== index);
    setDraft(next);
    if (sameFilters(draft, filters)) onApply(next);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onApply(draft);
  };

  const dirty = !sameFilters(draft, filters);

  return (
    <form className="filter-bar" onSubmit={submit}>
      {draft.map((filter, i) => (
        <div className="filter" key={i}>
          <select
            className="mono"
            value={filter.column}
            onChange={(e) => update(i, { column: e.target.value })}
            aria-label="Filter column"
          >
            {columns.map((column) => (
              <option key={column}>{column}</option>
            ))}
          </select>
          <select
            value={filter.operator}
            onChange={(e) => update(i, { operator: e.target.value as FilterOperator })}
            aria-label="Filter operator"
          >
            {FILTER_OPERATORS.map((operator) => (
              <option key={operator}>{operator}</option>
            ))}
          </select>
          {takesValue(filter.operator) && (
            <input
              className="mono"
              value={filter.value}
              onChange={(e) => update(i, { value: e.target.value })}
              placeholder={filter.operator === "in" ? "1, 2, 3" : "value"}
              aria-label="Filter value"
              autoFocus={filter.value === "" && i === draft.length - 1}
            />
          )}
          <button type="button" className="icon" onClick={() => remove(i)} title="Remove filter">
            ×
          </button>
        </div>
      ))}
      <button type="button" className="secondary" onClick={add} disabled={columns.length === 0}>
        + Filter
      </button>
      {(dirty || filters.length > 0) && (
        <>
          <button type="submit" disabled={!dirty}>
            Apply
          </button>
          <button type="button" className="secondary" onClick={() => onApply([])} disabled={filters.length === 0 && draft.length === 0}>
            Clear
          </button>
        </>
      )}
    </form>
  );
}
