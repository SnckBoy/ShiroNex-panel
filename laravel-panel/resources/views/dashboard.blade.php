<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Snck Dashboard</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="min-h-screen bg-slate-950 text-slate-100">
<header class="border-b border-slate-800 bg-slate-950/90">
    <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <span class="font-semibold tracking-wide">SNCK</span>
        <form method="POST" action="{{ route('logout') }}">@csrf<button class="text-sm text-slate-400 hover:text-white">Sign out</button></form>
    </div>
</header>
<main class="mx-auto max-w-7xl px-6 py-12">
    <p class="text-xs font-semibold uppercase tracking-[.22em] text-cyan-400">Laravel migration foundation</p>
    <h1 class="mt-3 text-4xl font-semibold">Welcome, {{ auth()->user()->username ?: auth()->user()->name }}</h1>
    <div class="mt-8 grid gap-4 sm:grid-cols-3">
        <div class="rounded-xl border border-slate-800 bg-slate-900 p-5"><p class="text-sm text-slate-400">Role</p><p class="mt-2 text-xl font-semibold">{{ ucfirst(auth()->user()->role) }}</p></div>
        <div class="rounded-xl border border-slate-800 bg-slate-900 p-5"><p class="text-sm text-slate-400">Database</p><p class="mt-2 text-xl font-semibold">{{ config('database.default') }}</p></div>
        <div class="rounded-xl border border-slate-800 bg-slate-900 p-5"><p class="text-sm text-slate-400">Node plane</p><p class="mt-2 text-xl font-semibold">Node daemon API</p></div>
    </div>
</main>
</body>
</html>
