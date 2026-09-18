import { initialsFor, avatarColorFor } from '../../lib/clientAvatar';

export default function ClientAvatar({ name, photo, size = 34 }) {
  if (photo) {
    return (
      <span className="client-avatar" style={{ width: size, height: size }}>
        <img src={photo} alt="" />
      </span>
    );
  }
  return (
    <span
      className="client-avatar"
      style={{ width: size, height: size, fontSize: size * 0.42, background: avatarColorFor(name) }}
    >
      {initialsFor(name)}
    </span>
  );
}
