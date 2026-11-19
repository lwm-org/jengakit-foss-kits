<script lang="ts">
  let tab = 'home';
</script>

<div class="flex h-screen bg-gray-50">
  <aside class="w-56 bg-white border-r flex flex-col p-4">
    <div class="font-bold text-lg mb-6">App</div>
    <nav class="space-y-1">
      <button
        on:click={() => tab = 'home'}
        class="w-full text-left px-3 py-2 rounded {tab === 'home' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}"
      >
        Home
      </button>
      <button
        on:click={() => tab = 'settings'}
        class="w-full text-left px-3 py-2 rounded {tab === 'settings' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}"
      >
        Settings
      </button>
    </nav>
  </aside>
  <main class="flex-1 p-8">
    <h1 class="text-2xl font-bold mb-4">Welcome</h1>
    <p class="text-gray-500">Your app is running. Deploy with a custom prompt to replace this page.</p>
  </main>
</div>
