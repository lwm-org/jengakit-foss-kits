import * as React from "react";
import "../styles/global.css";

const { useState } = React;

export default function IndexPage() {
  const [tab, setTab] = useState("home");
  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-56 bg-white border-r flex flex-col p-4">
        <div className="font-bold text-lg mb-6">App</div>
        <nav className="space-y-1">
          <button onClick={() => setTab("home")} className={`w-full text-left px-3 py-2 rounded ${tab === "home" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}>
            Home
          </button>
          <button onClick={() => setTab("settings")} className={`w-full text-left px-3 py-2 rounded ${tab === "settings" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}>
            Settings
          </button>
        </nav>
      </aside>
      <main className="flex-1 p-8">
        <h1 className="text-2xl font-bold mb-4">Welcome</h1>
        <p className="text-gray-500">Your app is running. Deploy with a custom prompt to replace this page.</p>
      </main>
    </div>
  );
}

export function Head() {
  return <title>App</title>;
}
