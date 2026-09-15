import { Link, useLocation } from 'react-router-dom';
import { ROUTE_META, DYNAMIC_ROUTE_META } from '../../routes/routeMeta';

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  const dynamicMatch = DYNAMIC_ROUTE_META.find((r) => r.test(pathname));
  const trail = ROUTE_META[pathname]?.trail ?? dynamicMatch?.trail ?? [];

  if (!trail.length) return <nav className="crumbs" />;

  return (
    <nav className="crumbs">
      <Link to="/">Home</Link>
      {trail.map((t, i) => (
        <span key={i} style={{ display: 'contents' }}>
          <span className="sep">/</span>
          {i === trail.length - 1 ? (
            <span className="cur">{t.label}</span>
          ) : t.to ? (
            <Link to={t.to}>{t.label}</Link>
          ) : (
            <span>{t.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
