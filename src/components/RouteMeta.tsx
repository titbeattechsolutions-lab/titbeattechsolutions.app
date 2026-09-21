import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const PUBLIC_ROUTES = ["/", "/auth", "/check"];

export function RouteMeta() {
  const location = useLocation();

  useEffect(() => {
    // 1. Determine if the current route is public
    const isPublic = PUBLIC_ROUTES.some(route => 
      location.pathname === route || location.pathname.startsWith(route + "/")
    );

    // 2. Update canonical URL
    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalLink);
    }
    // Remove trailing slash for consistency, except for root
    let path = location.pathname;
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    canonicalLink.setAttribute("href", "https://titbeattech.com" + path);

    // 3. Update robots meta tag
    let robotsMeta = document.querySelector('meta[name="robots"]');
    if (!robotsMeta) {
      robotsMeta = document.createElement("meta");
      robotsMeta.setAttribute("name", "robots");
      document.head.appendChild(robotsMeta);
    }
    
    if (isPublic) {
      robotsMeta.setAttribute("content", "index, follow");
    } else {
      robotsMeta.setAttribute("content", "noindex, nofollow");
    }
  }, [location.pathname]);

  return null;
}