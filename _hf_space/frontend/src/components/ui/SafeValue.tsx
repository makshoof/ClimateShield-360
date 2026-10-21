import React from 'react';
import { Tooltip } from './Tooltip';

interface SafeValueProps {
  value: unknown;
  kind?: 'number' | 'probability' | 'percent' | 'text';
  digits?: number;
}

function isUsableNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export const SafeValue: React.FC<SafeValueProps> = ({ value, kind = 'number', digits = 1 }) => {
  if (value == null || value === '') {
    return (
      <Tooltip content="Value missing from API response">
        <span className="text-on-surface-variant">n/a</span>
      </Tooltip>
    );
  }

  if (kind === 'text') {
    return <span>{String(value)}</span>;
  }

  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!isUsableNumber(numeric) || numeric < 0) {
    return (
      <Tooltip content="Invalid or out-of-range value">
        <span className="text-on-surface-variant">n/a</span>
      </Tooltip>
    );
  }

  if (kind === 'probability') {
    if (numeric > 1) {
      return (
        <Tooltip content="Probability must be between 0 and 1">
          <span className="text-on-surface-variant">n/a</span>
        </Tooltip>
      );
    }
    return <span title={String(numeric)}>{(numeric * 100).toFixed(digits)}%</span>;
  }

  if (kind === 'percent') {
    if (numeric > 100) {
      return (
        <Tooltip content="Percentage must be between 0 and 100">
          <span className="text-on-surface-variant">n/a</span>
        </Tooltip>
      );
    }
    return <span>{numeric.toFixed(digits)}%</span>;
  }

  return <span>{Number.isInteger(numeric) ? numeric : numeric.toFixed(digits)}</span>;
};
