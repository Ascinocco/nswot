import { useState, useMemo } from 'react';
import type { DataTableBlockData } from '../../../../main/domain/content-block.types';

interface DataTableBlockProps {
  data: DataTableBlockData;
}

export default function DataTableBlock({ data }: DataTableBlockProps): React.JSX.Element {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const sortedRows = useMemo(() => {
    if (sortCol === null) return data.rows;
    return [...data.rows].sort((a, b) => {
      const va = a[sortCol] ?? '';
      const vb = b[sortCol] ?? '';
      const cmp = va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' });
      return sortAsc ? cmp : -cmp;
    });
  }, [data.rows, sortCol, sortAsc]);

  const handleSort = (colIdx: number) => {
    if (sortCol === colIdx) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(colIdx);
      setSortAsc(true);
    }
  };

  return (
    <div className="my-3 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
      {data.title && (
        <h4 className="mb-2 text-sm font-medium text-gray-300">{data.title}</h4>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-700">
              {data.headers.map((header, i) => (
                <th
                  key={i}
                  onClick={() => handleSort(i)}
                  className="cursor-pointer px-2 py-1.5 font-medium text-gray-400 hover:text-gray-200 select-none"
                >
                  {header}
                  {sortCol === i && (
                    <span className="ml-1 text-gray-500">{sortAsc ? '\u25B2' : '\u25BC'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, ri) => (
              <tr key={ri} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-2 py-1.5 text-gray-300">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={data.headers.length} className="px-2 py-4 text-center text-gray-500 italic">
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
