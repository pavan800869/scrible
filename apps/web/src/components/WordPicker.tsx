import type { TurnWord } from '@scrible/protocol';

interface WordPickerProps {
  choices: TurnWord[];
  onPick: (index: number) => void;
}

const STARS: Record<string, string> = {
  easy: '★',
  medium: '★★',
  hard: '★★★',
};

export function WordPicker({ choices, onPick }: WordPickerProps) {
  return (
    <div className="picker">
      <p className="eyebrow" style={{ textAlign: 'center' }}>
        Your turn — pick a word
      </p>

      <div className="picker-options">
        {choices.map((choice, index) => (
          <button
            key={choice.text}
            className="picker-option"
            style={{ animationDelay: `${index * 60}ms` }}
            onClick={() => onPick(index)}
          >
            {choice.text}
            <span className="picker-stars">{STARS[choice.difficulty] ?? '★'}</span>
          </button>
        ))}
      </div>

      <p className="setting-hint" style={{ textAlign: 'center' }}>
        Harder words score more — for you and for everyone who guesses.
      </p>
    </div>
  );
}
