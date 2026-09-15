import { initialsFor, avatarColorFor } from '../../lib/clientAvatar';

export default function ClientAvatar({ name, size = 34 }) {
  return (
    <span
      className="client-avatar"
      style={{ width: size, height: size, fontSize: size * 0.42, background: avatarColorFor(name) }}
    >
      {initialsFor(name)}
    </span>
  );
}
