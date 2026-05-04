import React from 'react';

type MetaRowProps = {
  label: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export const MetaRow = React.memo(function MetaRow({ label, children, className, style }: MetaRowProps) {
  return (
    <div className={`meta-row${className ? ` ${className}` : ''}`} style={style}>
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
});
