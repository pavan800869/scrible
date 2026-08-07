import type { TurnWord } from '@scrible/protocol';

interface WordPickerProps {
  choices: TurnWord[];
  onPick: (index: number) => void;
}

/** Difficulty as filled pips out of three, plus the word for screen readers. */
const PIPS: Record<string, number> = { easy: 1, medium: 2, hard: 3 };

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
            <span className="picker-rank" aria-label={`${choice.difficulty} word`}>
              {[0, 1, 2].map((pip) => (
                <i
                  key={pip}
                  className={pip < (PIPS[choice.difficulty] ?? 1) ? 'is-on' : ''}
                  aria-hidden="true"
                />
              ))}
              <small>{choice.difficulty}</small>
            </span>
          </button>
        ))}
      </div>

      <p className="setting-hint" style={{ textAlign: 'center' }}>
        Harder words score more — for you and for everyone who guesses.
      </p>
    </div>
  );
}
