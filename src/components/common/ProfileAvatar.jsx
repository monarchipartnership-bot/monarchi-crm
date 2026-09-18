// Shared "manager/assignee avatar" — the same photo-with-initials-fallback
// pattern already duplicated inline across TopBar/TeamMembers/TaskBadges
// etc., extracted here for the spots that were missing the `profile.photo`
// check entirely and always fell back to a colored-initials circle.
import { avatarColorFor } from '../../lib/clientAvatar';

function initials(profile, email) {
  const first = profile?.first_name?.trim();
  const last = profile?.last_name?.trim();
  if (first) return (first[0] + (last ? last[0] : '')).toUpperCase();
  return (email || '?')[0].toUpperCase();
}

export default function ProfileAvatar({ profile, email, name, className = 'task-avatar', fallbackColor, style, ...rest }) {
  if (profile?.photo) {
    return (
      <span className={className} style={style} {...rest}>
        <img src={profile.photo} alt="" />
      </span>
    );
  }
  const colorKey = name || profile?.email || email || '';
  return (
    <span className={className} style={{ background: fallbackColor || avatarColorFor(colorKey), color: '#fff', ...style }} {...rest}>
      {initials(profile, email)}
    </span>
  );
}
