import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useParams, useNavigate } from 'react-router-dom';

interface BotConfig {
  username: string;
  telegram_token: string;
  openrouter_key_id: string;
  is_active: boolean;
  model: string;
  system_prompt: string;
  default_language: string;
  welcome_messages: { lang: string; text: string }[];
  max_history: number;
  session_ttl: number;
  group_mode: 'all' | 'mention_only' | 'admin_only';
  mention_trigger: string;
  reply_to_mentions: boolean;
  commands: { command: string; description: string }[];
  inline_keyboard_template?: Record<string, unknown>;
  web_app_url?: string;
  payments?: { enabled: boolean; prices: { label: string; amount: number }[] };
  model_params: {
    temperature: number;
    max_tokens: number;
    top_p: number;
    frequency_penalty: number;
    presence_penalty: number;
  };
  streaming: boolean;
}

function App() {
  return (
    <BrowserRouter basename="/admin">
      <div className="min-h-screen bg-gray-900 text-gray-100">
        <nav className="bg-gray-800 p-4">
          <div className="container mx-auto flex gap-4">
            <Link to="/" className="hover:text-blue-400">Bots</Link>
            <Link to="/keys" className="hover:text-blue-400">API Keys</Link>
            <Link to="/settings" className="hover:text-blue-400">Settings</Link>
          </div>
        </nav>
        <main className="container mx-auto p-4">
          <Routes>
            <Route path="/" element={<BotList />} />
            <Route path="/bot/:username" element={<BotEditor />} />
            <Route path="/keys" element={<KeysPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

function BotList() {
  const [bots, setBots] = useState<BotConfig[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/bots')
      .then(r => r.json())
      .then(setBots)
      .catch(console.error);
  }, []);

  const createBot = async () => {
    const username = prompt('Bot username:');
    if (!username) return;
    const telegram_token = prompt('Telegram token:');
    if (!telegram_token) return;

    const res = await fetch('/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, telegram_token }),
    });

    if (res.ok) {
      navigate(`/bot/${username}`);
    } else {
      alert('Failed to create bot');
    }
  };

  const deleteBot = async (username: string) => {
    if (!confirm(`Delete bot ${username}?`)) return;
    await fetch(`/api/bots/${username}`, { method: 'DELETE' });
    setBots(bots.filter(b => b.username !== username));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Bots</h1>
      <button onClick={createBot} className="bg-blue-600 px-4 py-2 rounded mb-4 hover:bg-blue-700">
        Create Bot
      </button>
      <table className="w-full bg-gray-800 rounded">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="p-3 text-left">Username</th>
            <th className="p-3 text-left">Model</th>
            <th className="p-3 text-left">Active</th>
            <th className="p-3 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {bots.map(bot => (
            <tr key={bot.username} className="border-b border-gray-700">
              <td className="p-3">{bot.username}</td>
              <td className="p-3">{bot.model}</td>
              <td className="p-3">{bot.is_active ? '✓' : '✗'}</td>
              <td className="p-3">
                <button onClick={() => navigate(`/bot/${bot.username}`)} className="text-blue-400 hover:underline mr-2">
                  Edit
                </button>
                <button onClick={() => deleteBot(bot.username)} className="text-red-400 hover:underline">
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BotEditor() {
  const { username } = useParams<{ username: string }>();
  const [bot, setBot] = useState<BotConfig | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (username) {
      fetch(`/api/bots/${username}`)
        .then(r => r.json())
        .then(setBot)
        .catch(console.error);
    }
  }, [username]);

  const updateField = async (field: keyof BotConfig, value: any) => {
    if (!bot) return;
    const updated = { ...bot, [field]: value };
    
    try {
      const res = await fetch(`/api/bots/${bot.username}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });

      if (res.ok) {
        setBot(updated);
        setToast(`Saved '${String(field)}'`);
        setTimeout(() => setToast(null), 5000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!bot) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Edit Bot: {bot.username}</h1>
      
      {toast && (
        <div className="fixed bottom-4 right-4 bg-green-600 px-4 py-2 rounded shadow-lg">
          {toast}
        </div>
      )}

      <div className="space-y-6">
        <Section title="Identity">
          <Field label="Telegram Token" value={bot.telegram_token} onChange={v => updateField('telegram_token', v)} type="password" />
          <Field label="OpenRouter Key ID" value={bot.openrouter_key_id} onChange={v => updateField('openrouter_key_id', v)} />
          <Checkbox label="Active" checked={bot.is_active} onChange={v => updateField('is_active', v)} />
        </Section>

        <Section title="Model">
          <Field label="Model" value={bot.model} onChange={v => updateField('model', v)} />
          <NumberField label="Temperature" value={bot.model_params.temperature} onChange={v => updateNestedField('model_params', 'temperature', v)} min={0} max={2} step={0.1} />
          <NumberField label="Max Tokens" value={bot.model_params.max_tokens} onChange={v => updateNestedField('model_params', 'max_tokens', v)} min={1} />
          <Checkbox label="Streaming" checked={bot.streaming} onChange={v => updateField('streaming', v)} />
        </Section>

        <Section title="Localization">
          <Field label="Default Language" value={bot.default_language} onChange={v => updateField('default_language', v)} />
          <div className="mt-2">
            <label className="block text-sm font-medium mb-1">Welcome Messages</label>
            {bot.welcome_messages.map((wm, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input className="bg-gray-700 px-2 py-1 rounded w-20" value={wm.lang} onChange={e => {
                  const updated = [...bot.welcome_messages];
                  updated[i].lang = e.target.value;
                  updateField('welcome_messages', updated);
                }} />
                <input className="bg-gray-700 px-2 py-1 rounded flex-1" value={wm.text} onChange={e => {
                  const updated = [...bot.welcome_messages];
                  updated[i].text = e.target.value;
                  updateField('welcome_messages', updated);
                }} />
                <button onClick={() => {
                  const updated = bot.welcome_messages.filter((_, idx) => idx !== i);
                  updateField('welcome_messages', updated);
                }} className="text-red-400">×</button>
              </div>
            ))}
            <button onClick={() => updateField('welcome_messages', [...bot.welcome_messages, { lang: 'en', text: '' }])} className="text-blue-400 text-sm">
              + Add
            </button>
          </div>
        </Section>

        <Section title="Session">
          <NumberField label="Max History" value={bot.max_history} onChange={v => updateField('max_history', v)} min={1} />
          <NumberField label="Session TTL (seconds)" value={bot.session_ttl} onChange={v => updateField('session_ttl', v)} min={60} />
        </Section>

        <Section title="Group Settings">
          <Select label="Group Mode" value={bot.group_mode} onChange={v => updateField('group_mode', v)} options={['all', 'mention_only', 'admin_only']} />
          <Field label="Mention Trigger" value={bot.mention_trigger} onChange={v => updateField('mention_trigger', v)} />
          <Checkbox label="Reply to Mentions" checked={bot.reply_to_mentions} onChange={v => updateField('reply_to_mentions', v)} />
        </Section>

        <Section title="Commands">
          {bot.commands.map((cmd, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input className="bg-gray-700 px-2 py-1 rounded" placeholder="/command" value={cmd.command} onChange={e => {
                const updated = [...bot.commands];
                updated[i].command = e.target.value;
                updateField('commands', updated);
              }} />
              <input className="bg-gray-700 px-2 py-1 rounded flex-1" placeholder="Description" value={cmd.description} onChange={e => {
                const updated = [...bot.commands];
                updated[i].description = e.target.value;
                updateField('commands', updated);
              }} />
              <button onClick={() => {
                const updated = bot.commands.filter((_, idx) => idx !== i);
                updateField('commands', updated);
              }} className="text-red-400">×</button>
            </div>
          ))}
          <button onClick={() => updateField('commands', [...bot.commands, { command: '', description: '' }])} className="text-blue-400 text-sm">
            + Add Command
          </button>
        </Section>
      </div>
    </div>
  );

  function updateNestedField(parent: keyof BotConfig, field: string, value: any) {
    if (!bot) return;
    const updated = { ...bot, [parent]: { ...(bot[parent] as any), [field]: value } };
    updateField(parent, updated[parent]);
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-gray-800 rounded p-4">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-left font-semibold">
        {title}
        <span>{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="mt-4 space-y-3">{children}</div>}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} onBlur={e => onChange(e.target.value)} className="w-full bg-gray-700 px-3 py-2 rounded" />
    </div>
  );
}

function NumberField({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input type="number" value={value} onChange={e => onChange(Number(e.target.value))} onBlur={e => onChange(Number(e.target.value))} min={min} max={max} step={step} className="w-full bg-gray-700 px-3 py-2 rounded" />
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full bg-gray-700 px-3 py-2 rounded">
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );
}

function KeysPage() {
  const [keys, setKeys] = useState<{ id: string; name: string; created_at: string }[]>([]);

  useEffect(() => {
    fetch('/api/keys')
      .then(r => r.json())
      .then(setKeys)
      .catch(console.error);
  }, []);

  const addKey = async () => {
    const name = prompt('Key name:');
    if (!name) return;
    const key = prompt('OpenRouter API key (sk-or-v1-...):');
    if (!key) return;

    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, key }),
    });

    if (res.ok) {
      const data = await res.json();
      setKeys([...keys, data]);
    }
  };

  const deleteKey = async (id: string) => {
    if (!confirm('Delete this key?')) return;
    await fetch(`/api/keys/${id}`, { method: 'DELETE' });
    setKeys(keys.filter(k => k.id !== id));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">API Keys</h1>
      <button onClick={addKey} className="bg-blue-600 px-4 py-2 rounded mb-4 hover:bg-blue-700">
        Add Key
      </button>
      <table className="w-full bg-gray-800 rounded">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="p-3 text-left">Name</th>
            <th className="p-3 text-left">Key</th>
            <th className="p-3 text-left">Created</th>
            <th className="p-3 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {keys.map(key => (
            <tr key={key.id} className="border-b border-gray-700">
              <td className="p-3">{key.name}</td>
              <td className="p-3 font-mono">***</td>
              <td className="p-3">{new Date(key.created_at).toLocaleDateString()}</td>
              <td className="p-3">
                <button onClick={() => deleteKey(key.id)} className="text-red-400 hover:underline">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsPage() {
  const [settings, setSettings] = useState<{ default_max_history: number; default_session_ttl: number }>({
    default_max_history: 20,
    default_session_ttl: 3600,
  });

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(setSettings)
      .catch(console.error);
  }, []);

  const updateSetting = async (field: string, value: number) => {
    const updated = { ...settings, [field]: value };
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (res.ok) setSettings(updated);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Global Settings</h1>
      <div className="bg-gray-800 rounded p-4 space-y-4 max-w-md">
        <NumberField label="Default Max History" value={settings.default_max_history} onChange={v => updateSetting('default_max_history', v)} />
        <NumberField label="Default Session TTL (seconds)" value={settings.default_session_ttl} onChange={v => updateSetting('default_session_ttl', v)} />
      </div>
    </div>
  );
}

export default App;
