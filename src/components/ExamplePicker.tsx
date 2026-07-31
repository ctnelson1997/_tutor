import { useState } from 'react';
import { NavDropdown } from 'react-bootstrap';
import { useStore } from '../store/useStore';
import type { ViewerExample } from '../types/viewer';

interface Props {
  examples: ViewerExample[];
}

function exampleKey(ex: ViewerExample, idx: number): string {
  return ex.slug ?? `${ex.title}__${idx}`;
}

export default function ExamplePicker({ examples }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);

  const setCode = useStore((s) => s.setCode);
  const setLanguage = useStore((s) => s.setLanguage);
  const setSnapshots = useStore((s) => s.setSnapshots);
  const setCurrentStep = useStore((s) => s.setCurrentStep);
  const reset = useStore((s) => s.reset);

  if (examples.length <= 1) return null;

  const handleSelect = (idx: number) => {
    const ex = examples[idx];
    if (!ex) return;
    setActiveIdx(idx);
    reset();
    setLanguage(ex.language);
    setCode(ex.code);
    setSnapshots(ex.snapshots);
    setCurrentStep(0);
  };

  const active = examples[activeIdx] ?? examples[0];

  return (
    <NavDropdown title={active.title} id="viewer-examples" align="start">
      {examples.map((ex, idx) => (
        <NavDropdown.Item
          key={exampleKey(ex, idx)}
          active={idx === activeIdx}
          onClick={() => handleSelect(idx)}
        >
          {ex.title}
        </NavDropdown.Item>
      ))}
    </NavDropdown>
  );
}
