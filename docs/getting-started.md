# Getting started

JustDirect is a free AI film studio that runs on your own computer. You describe a story; its AI
plans the shots, paints the cast, the places and the props once and reuses them, and makes each shot
— and you can change any step by hand. Everything runs on your computer with the AI models it
downloads; nothing is sent anywhere unless you connect an online AI service with your own key.
How a film is made: [Your films](films.md).

**What it needs.** A graphics card with 8 GB of memory is the least it runs on (an NVIDIA RTX 2070
or newer), with 32 GB of the computer's memory. Pictures take under a minute; a clip of a few seconds
takes several minutes on an 8 GB card, less on a bigger one.

## Installing it

Download the installer for your computer from the app's releases page: **Windows** the `…-win-x64.exe`,
**macOS** (Apple silicon — M1 and later) the `.dmg`, **Linux** the `.AppImage`. The installers aren't signed with
a publisher's certificate, so the first time:

- **Windows** says "Windows protected your PC": press **More info**, then **Run anyway**.
- **macOS** says the app can't be opened. On macOS 15 and later: open **System Settings → Privacy & Security**,
  go to **Security** and press **Open Anyway** (it's there for about an hour after you try to open the app), then
  enter your password. On macOS 14 and earlier: Control-click the app in Finder and choose **Open**. If it says the
  app "is damaged", run `xattr -cr "/Applications/JustDirect.app"` in Terminal once, then open it.
- **Linux**: make the `.AppImage` executable (`chmod +x`) and run it — nothing else to install.
- **Windows with Smart App Control on** (some new Windows 11 computers) blocks the app with no **Run anyway**: the
  app's files aren't signed. It runs once Smart App Control is off (Windows Security → App & browser control →
  Smart App Control).

## Where your data lives

Everything the app keeps — your films with their pictures and clips, your settings, the AI engines and downloaded models, and
the logs — lives in **one data folder**. By default it is a `data` folder beside the app, so
moving the app's folder moves everything with it. **Settings → Storage** shows the folder and can
move it: **Change folder…** copies the data into a new **JustDirect** folder inside the one you
pick (never into the app's own folder, which an update replaces) and restarts the app on it. The old
folder keeps its copy until **Remove the old copy…** deletes what the move copied there (Storage says
when the app ran on the old copy after the move). An old copy the app can't find is **Not found**, with
why — its folder isn't there (its drive unplugged, the folder renamed or deleted), or the folder there now
isn't that copy (another drive in its place, a folder copied by hand); one on a drive that didn't answer
(a network folder offline, a drive waking) reads **Didn't answer just now**, with **Try again**. Such a copy
is never removed, and stays listed until it is found again or you press **Forget…**, which only stops the
app listing it (nothing on any drive is touched). **Move back to the default folder…** brings the data back once any old
copy there is removed. While the app runs on an old copy, or on the default folder this time, Storage says
where your data is and, when that folder can't be used, why — fix that and restart, or **Use the default
folder from now on…**; once that folder can be used again, restart the app to use it; when the variable names
the old copy, change it to the folder Storage names — and **Change folder…** isn't shown. A headless server takes `--data-dir` or
`JUST_DIRECT_DATA_DIR` (a folder that already exists); while the variable names the desktop app's
folder, **Change folder…** isn't shown — change the variable instead. Only when the app's own folder can't be
written to (Program Files, read-only media) does it fall back to the standard per-user folder.

## Two ways to run it

- **The desktop app** — the window this page lives in. It starts its own server and stops it
  when you quit (unless **Settings → Server → Keep server running** is on: then closing the
  window hides the app to the tray).
- **Headless** — the same server without a window: run `just-direct-server serve` (from a
  source checkout, `npm run server`) and open its address (`http://127.0.0.1:17500`) in a
  browser. The server hosts the whole app. The command is beside the app on Windows (in its
  folder: `.\just-direct-server serve` in PowerShell) and Linux (an AppImage: after
  `--appimage-extract`, in `squashfs-root/`), and in the Mac app's `Contents/Resources`. The server
  answers only on its own computer; for other computers, start it with `--host 0.0.0.0` and use
  that computer's network address. Add an access token first in **Settings → Server**: a browser
  elsewhere then asks for it once — or open the address **Copy the address with this token** gives
  (with the network address in place of `127.0.0.1`), and it signs in by itself. The desktop app
  and a headless server share the data folder one at a time: quit the desktop app first; opening it
  stops a headless server on its port. Behind a reverse proxy on the same computer, name its public
  address in `JUST_DIRECT_ALLOWED_HOSTS` (the server answers its own computer only under its
  own names) and keep a token on: requests through a proxy always need one.

## Backups

**Settings → Backups** saves everything in one file, your AI providers' keys included — keep it like
a password. The access tokens aren't in it, and a restore keeps this computer's own (and its
downloaded engines' settings).

## First launch

1. The start-up picture may show a model bar — the app is loading your default local AI model
   so the first AI request doesn't wait for it. **Continue** goes straight into the app; the load
   finishes in the background.
2. If the window shows *"Can't reach the server"*, the server didn't start. See
   [Troubleshooting](troubleshooting.md).
3. Press **New film** and give it a title. When you create your first film, the app offers once to
   set up its AI — see [Set up the AI](ai-providers.md). Each AI feature also says in place what it
   still needs (its engine to install, its model to download) and offers it there.

## Getting around

The sidebar has **Films**, **AI Settings**, **App Settings** and **AI tasks**, which opens the panel
of running and recent AI work. The **?** beside a page's title opens its help page.
