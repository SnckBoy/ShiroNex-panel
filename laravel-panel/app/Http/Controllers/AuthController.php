<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\View\View;

class AuthController extends Controller
{
    public function setupForm(): View|RedirectResponse
    {
        if (User::query()->exists()) return redirect()->route('login');
        return view('auth.setup');
    }

    public function setup(Request $request): RedirectResponse
    {
        if (User::query()->exists()) return redirect()->route('login');
        $data = $request->validate([
            'username' => ['required', 'string', 'max:64', 'alpha_dash', 'unique:users,username'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'confirmed', 'string', 'min:8'],
        ]);
        $user = User::create([
            'name' => $data['username'],
            'username' => $data['username'],
            'email' => strtolower($data['email']),
            'role' => 'owner',
            'password' => Hash::make($data['password']),
        ]);
        Auth::login($user);
        $request->session()->regenerate();
        return redirect()->route('dashboard');
    }

    public function loginForm(): View|RedirectResponse
    {
        if (!User::query()->exists()) return redirect()->route('setup');
        if (Auth::check()) return redirect()->route('dashboard');
        return view('auth.login');
    }

    public function login(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'identity' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);
        $field = filter_var($data['identity'], FILTER_VALIDATE_EMAIL) ? 'email' : 'username';
        if (!Auth::attempt([$field => strtolower($data['identity']), 'password' => $data['password']])) {
            return back()->withErrors(['identity' => 'The credentials are invalid.'])->onlyInput('identity');
        }
        $request->session()->regenerate();
        return redirect()->intended(route('dashboard'));
    }

    public function logout(Request $request): RedirectResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        return redirect()->route('login');
    }
}
