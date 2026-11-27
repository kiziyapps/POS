import React, { useState } from 'react';
import { Lock, Settings, KeyRound, User } from 'lucide-react';
import { useAuth } from '../store/AuthContext.jsx';
import { getGasUrl, setGasUrl } from '../config/env.mjs';

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [secret, setSecret] = useState('');
  const [mode, setMode] = useState('PASSWORD');
  const [gasUrlInput, setGasUrlInput] = useState(getGasUrl());
  const [showConfig, setShowConfig] = useState(!getGasUrl() || getGasUrl().includes('YOUR_DEPLOYMENT_ID'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleToggleConfig = () => setShowConfig((prev) => !prev);
  const handleSelectPasswordMode = () => setMode('PASSWORD');
  const handleSelectPinMode = () => setMode('PIN');
  const handleGasUrlChange = (e) => setGasUrlInput(e.target.value);
  const handleUsernameChange = (e) => setUsername(e.target.value);
  const handleSecretChange = (e) => setSecret(e.target.value);

  const pwTabClass = mode === 'PASSWORD'
    ? 'flex-1 py-1.5 text-xs font-semibold rounded-md transition bg-white shadow text-slate-900'
    : 'flex-1 py-1.5 text-xs font-semibold rounded-md transition text-slate-500';
  const pinTabClass = mode === 'PIN'
    ? 'flex-1 py-1.5 text-xs font-semibold rounded-md transition bg-white shadow text-slate-900'
    : 'flex-1 py-1.5 text-xs font-semibold rounded-md transition text-slate-500';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      setGasUrl(gasUrlInput);
      await login(username, secret, mode);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-slate-900 p-6 text-white flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">KIZIY APPS</h1>
            <p className="text-xs text-slate-400 mt-0.5">Enterprise Retail Web POS</p>
          </div>
          <button type="button" onClick={handleToggleConfig} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300" title="Konfigurasi URL GAS Backend">
            <Settings className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {showConfig && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                URL Web App GAS Backend
              </label>
              <input type="url" value={gasUrlInput} onChange={handleGasUrlChange} placeholder="https://script.google.com/macros/s/.../exec" className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" required />
            </div>
          )}

          <div className="flex rounded-lg bg-slate-100 p-1">
            <button type="button" onClick={handleSelectPasswordMode} className={pwTabClass}>
              Login PASSWORD
            </button>
            <button type="button" onClick={handleSelectPinMode} className={pinTabClass}>
              Login PIN
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input type="text" value={username} onChange={handleUsernameChange} className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" required />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {mode === 'PIN' ? 'PIN Kasir (6 Digit)' : 'Password'}
            </label>
            <div className="relative">
              {mode === 'PIN' ? <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" /> : <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />}
              <input type="password" value={secret} onChange={handleSecretChange} placeholder={mode === 'PIN' ? '••••••' : 'Masukkan password'} className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" required />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition">
            {loading ? 'Memverifikasi...' : 'Masuk ke KIZIY POS'}
          </button>
        </form>
      </div>
    </div>
  );
}
