import { BRUSH_SIZES, PALETTE } from '../canvas/protocol.js';
import { Icon } from './Icon.js';

export type Tool = 'brush' | 'eraser' | 'fill';

interface ToolbarProps {
  tool: Tool;
  colorIndex: number;
  sizeIndex: number;
  onTool: (tool: Tool) => void;
  onColor: (index: number) => void;
  onSize: (index: number) => void;
  onUndo: () => void;
  onClear: () => void;
}

export function Toolbar(props: ToolbarProps) {
  return (
    <div className="toolbar panel" role="toolbar" aria-label="Drawing tools">
      <div className="swatches">
        {PALETTE.map((color, index) => (
          <button
            key={color}
            className={`swatch${index === props.colorIndex ? ' is-active' : ''}`}
            style={{ background: color }}
            onClick={() => props.onColor(index)}
            aria-label={`Colour ${index + 1}`}
            aria-pressed={index === props.colorIndex}
          />
        ))}
      </div>

      <div className="tool-group">
        {(['brush', 'eraser', 'fill'] as const).map((tool) => (
          <button
            key={tool}
            className={`tool${props.tool === tool ? ' is-active' : ''}`}
            onClick={() => props.onTool(tool)}
            aria-label={LABEL[tool]}
            aria-pressed={props.tool === tool}
            title={`${LABEL[tool]} (${SHORTCUT[tool]})`}
          >
            <Icon name={tool} />
          </button>
        ))}
      </div>

      <div className="tool-group">
        {BRUSH_SIZES.map((size, index) => (
          <button
            key={size}
            className={`tool${index === props.sizeIndex ? ' is-active' : ''}`}
            onClick={() => props.onSize(index)}
            aria-label={`Brush size ${index + 1}`}
            aria-pressed={index === props.sizeIndex}
            title={`Size ${index + 1} (${index + 1})`}
          >
            <span
              className="size-dot"
              style={{ width: Math.min(20, size), height: Math.min(20, size) }}
            />
          </button>
        ))}
      </div>

      <div className="tool-group">
        <button className="tool" onClick={props.onUndo} aria-label="Undo" title="Undo (U)">
          <Icon name="undo" />
        </button>
        <button className="tool" onClick={props.onClear} aria-label="Clear canvas" title="Clear (C)">
          <Icon name="clear" />
        </button>
      </div>
    </div>
  );
}

const LABEL: Record<Tool, string> = {
  brush: 'Brush',
  eraser: 'Eraser',
  fill: 'Fill',
};

const SHORTCUT: Record<Tool, string> = {
  brush: 'B',
  eraser: 'E',
  fill: 'F',
};
