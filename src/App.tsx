import React, { useEffect, useState } from "react";
import BudgetCalculator from "./BudgetCalculator_v3";
import DataExplorerPage from "./pages/DataExplorerPage";

type Route = "#/dashboard" | "#/data";
const BASE = import.meta.env.BASE_URL || "/";

function useHashRoute(): Route {
  const getRoute = (): Route => (window.location.hash === "#/data" ? "#/data" : "#/dashboard");
  const [route, setRoute] = useState<Route>(getRoute());
  useEffect(() => {
    const onHash = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

export default function App() {
  const route = useHashRoute();

  return (
    <div className="min-h-screen w-full bg-[#f6f5f2] text-black">
      {/* Mobile top bar */}
      <div className="md:hidden bg-[#eae6dd] border-b border-black/10 sticky top-0 z-40">
        <div className="px-4 h-14 flex items-center justify-between">
          <h1 className="text-lg font-bold">Illinois Budget Explorer</h1>
          <select
            value={route}
            onChange={(e) => (window.location.hash = e.target.value)}
            className="text-sm border border-black/20 rounded px-2 py-1 bg-white"
          >
            <option value="#/dashboard">Dashboard</option>
            <option value="#/data">Data Explorer</option>
          </select>
        </div>
      </div>

      <div className="md:grid md:grid-cols-[240px_minmax(0,1fr)]">
        {/* Sidebar (desktop) */}
        <aside className="hidden md:block bg-[#eae6dd] border-r border-black/10 min-h-screen sticky top-0">
          <div className="p-4">
            <div className="text-xl font-bold mb-4">Illinois Budget Explorer</div>
            <nav className="flex flex-col gap-2 text-sm">
              <a
                href={`${BASE}#/dashboard`}
                className={`px-3 py-2 rounded ${route === "#/dashboard" ? "bg-white font-semibold shadow-sm" : "hover:bg-white/70"}`}
              >
                Dashboard
              </a>
              <a
                href={`${BASE}#/data`}
                className={`px-3 py-2 rounded ${route === "#/data" ? "bg-white font-semibold shadow-sm" : "hover:bg-white/70"}`}
              >
                Data Explorer
              </a>
            </nav>
          </div>
        </aside>

        {/* Page body */}
        <main className="min-h-screen">
          {route === "#/data" ? <DataExplorerPage /> : <BudgetCalculator />}
        </main>
      </div>
    </div>
  );
}
