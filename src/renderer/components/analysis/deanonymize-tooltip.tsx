import { useState, useRef, useEffect } from 'react';

interface DeanonymizeTooltipProps {
  text: string;
  pseudonymMap: Record<string, string>;
}

const PSEUDONYM_PATTERN = /\bStakeholder [A-Z]{1,2}\b/g;

interface TooltipState {
  visible: boolean;
  realName: string;
  x: number;
  y: number;
}

export default function DeanonymizeTooltip({
  text,
  pseudonymMap,
}: DeanonymizeTooltipProps): React.JSX.Element {
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    realName: '',
    x: 0,
    y: 0,
  });
  const containerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tooltip.visible || !tooltipRef.current || !containerRef.current) return;
    const tooltipEl = tooltipRef.current;
    const containerRect = containerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();

    // Prevent tooltip from going off-screen right
    if (tooltipRect.right > window.innerWidth) {
      tooltipEl.style.left = `${window.innerWidth - tooltipRect.width - containerRect.left - 8}px`;
    }
  }, [tooltip.visible, tooltip.x]);

  const segments = splitByPseudonyms(text, pseudonymMap);

  if (segments.length === 1 && !segments[0]!.pseudonym) {
    return <span>{text}</span>;
  }

  return (
    <span ref={containerRef} className="relative">
      {segments.map((segment, i) =>
        segment.pseudonym ? (
          <span
            key={i}
            className="cursor-help border-b border-dotted border-gray-500"
            onMouseEnter={(e) => {
              const rect = (e.target as HTMLElement).getBoundingClientRect();
              const containerRect = containerRef.current?.getBoundingClientRect();
              setTooltip({
                visible: true,
                realName: pseudonymMap[segment.text]!,
                x: rect.left - (containerRect?.left ?? 0),
                y: rect.bottom - (containerRect?.top ?? 0) + 4,
              });
            }}
            onMouseLeave={() =>
              setTooltip((prev) => ({ ...prev, visible: false }))
            }
          >
            {segment.text}
          </span>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
      {tooltip.visible && (
        <div
          ref={tooltipRef}
          className="absolute z-50 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <span className="font-medium text-gray-200">{tooltip.realName}</span>
          <span className="ml-1.5 text-gray-500">(local only)</span>
        </div>
      )}
    </span>
  );
}

interface TextSegment {
  text: string;
  pseudonym: boolean;
}

function splitByPseudonyms(
  text: string,
  pseudonymMap: Record<string, string>,
): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(PSEUDONYM_PATTERN)) {
    const matchText = match[0];
    const matchIndex = match.index;

    if (!(matchText in pseudonymMap)) continue;

    if (matchIndex > lastIndex) {
      segments.push({ text: text.slice(lastIndex, matchIndex), pseudonym: false });
    }
    segments.push({ text: matchText, pseudonym: true });
    lastIndex = matchIndex + matchText.length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), pseudonym: false });
  }

  if (segments.length === 0) {
    segments.push({ text, pseudonym: false });
  }

  return segments;
}
