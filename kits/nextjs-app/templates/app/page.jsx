import { LayoutDashboard, Users, Settings, Plus } from 'lucide-react';
export default function Home() {
  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="p-6 font-bold text-xl flex items-center gap-2"><LayoutDashboard className="text-blue-600"/> SaaSApp</div>
        <nav className="flex-1 px-4 space-y-2">
          <a href="#" className="flex items-center gap-3 p-3 bg-blue-50 text-blue-700 rounded-lg"><LayoutDashboard size={20}/> Overview</a>
          <a href="#" className="flex items-center gap-3 p-3 text-gray-600 hover:bg-gray-50 rounded-lg"><Users size={20}/> Customers</a>
          <a href="#" className="flex items-center gap-3 p-3 text-gray-600 hover:bg-gray-50 rounded-lg"><Settings size={20}/> Settings</a>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Dashboard Overview</h1>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition">
            <Plus size={18}/> New Entry
          </button>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[ {l: 'Revenue', v: '$12,450'}, {l: 'Active Users', v: '1,204'}, {l: 'Churn Rate', v: '2.4%'} ].map((s,i) => (
            <div key={i} className="bg-white p-6 rounded-xl border">
              <p className="text-sm text-gray-500 mb-1">{s.l}</p>
              <p className="text-2xl font-bold">{s.v}</p>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-4 font-semibold text-sm">User</th>
                <th className="p-4 font-semibold text-sm">Status</th>
                <th className="p-4 font-semibold text-sm">Plan</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b hover:bg-gray-50">
                <td className="p-4">John Doe</td>
                <td className="p-4 text-green-600">Active</td>
                <td className="p-4">Pro</td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}