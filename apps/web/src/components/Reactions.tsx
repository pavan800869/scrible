import type { Reaction } from '@scrible/protocol';
import { Icon } from './Icon.js';

interface ReactionsProps {
  likes: number;
  dislikes: number;
  /** The viewer's own vote, or null when they have not voted. */
  mine: Reaction | null;
  /** The drawer sees the verdict but cannot vote on their own drawing. */
  readOnly: boolean;
  /** Points the tally is currently worth to the drawer. */
  bonus: number;
  onReact: (kind: Reaction) => void;
}

/**
 * The room's verdict on the drawing in progress.
 *
 * Votes are live and toggleable, so the bar doubles as a running score preview
 * for the drawer — which is the point: applause is worth points.
 */
export function Reactions({ likes, dislikes, mine, readOnly, bonus, onReact }: ReactionsProps) {
  return (
    <div className="reactions panel" role="group" aria-label="Rate this drawing">
      <span className="eyebrow reactions-label">{readOnly ? 'The room says' : 'Rate it'}</span>

      <div className="reaction-pair">
        <ReactionButton
          kind="like"
          count={likes}
          active={mine === 'like'}
          readOnly={readOnly}
          onReact={onReact}
        />
        <ReactionButton
          kind="dislike"
          count={dislikes}
          active={mine === 'dislike'}
          readOnly={readOnly}
          onReact={onReact}
        />
      </div>

      <span className={`reaction-bonus${bonus === 0 ? ' is-neutral' : bonus > 0 ? ' is-up' : ' is-down'}`}>
        {bonus > 0 ? `+${bonus}` : bonus}
        <small>{readOnly ? 'to you' : 'to the drawer'}</small>
      </span>
    </div>
  );
}

const COPY: Record<Reaction, { verb: string; noun: string }> = {
  like: { verb: 'Like this drawing', noun: 'likes' },
  dislike: { verb: 'Dislike this drawing', noun: 'dislikes' },
};

function ReactionButton(props: {
  kind: Reaction;
  count: number;
  active: boolean;
  readOnly: boolean;
  onReact: (kind: Reaction) => void;
}) {
  const copy = COPY[props.kind];
  const classes = ['reaction', `is-${props.kind}`];
  if (props.active) classes.push('is-active');

  return (
    <button
      className={classes.join(' ')}
      onClick={() => props.onReact(props.kind)}
      disabled={props.readOnly}
      aria-pressed={props.active}
      aria-label={`${copy.verb} — ${props.count} ${copy.noun}`}
      title={props.active ? 'Click again to take it back' : copy.verb}
    >
      <Icon name={props.kind} size={17} />
      <span className="reaction-count">{props.count}</span>
    </button>
  );
}
