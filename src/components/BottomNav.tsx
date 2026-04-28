import { LayoutDashboard, Package, ShoppingCart, Boxes, Users } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, exact: true },
  { title: "Catálogo", url: "/catalogo", icon: Package, exact: false },
  { title: "PDV", url: "/vendas", icon: ShoppingCart, exact: true },
  { title: "Estoque", url: "/estoque", icon: Boxes, exact: false },
  { title: "Clientes", url: "/clientes", icon: Users, exact: false },
];

/**
 * Mobile-only bottom navigation. Hidden on lg+ where the sidebar is shown.
 * Sits above the iOS safe-area inset.
 */
export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      className={cn(
        "lg:hidden fixed bottom-0 inset-x-0 z-40",
        "bg-background/95 backdrop-blur border-t border-border",
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <ul className="grid grid-cols-5">
        {items.map((it) => {
          const active = it.exact
            ? pathname === it.url
            : pathname === it.url || pathname.startsWith(it.url + "/");
          const Icon = it.icon;
          return (
            <li key={it.url}>
              <NavLink
                to={it.url}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2 min-h-[56px]",
                  "text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "stroke-[2.4]")} />
                <span className="leading-none">{it.title}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}