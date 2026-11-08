# Troubleshooting

**"Can't reach the server".** The app's server isn't running, or its port (17500) is taken — the screen
says which when it knows:

- **Another program is using port 17500** — close that program, then press **Retry**.
- **Another person signed in to this computer has the app open** — one copy runs at a time on a computer: they
  quit theirs (its tray icon, **Quit**), then press **Retry**.
- **Windows has reserved port 17500** (Hyper-V, WSL or Docker reserve ranges of ports at start) — restarting
  the computer usually frees it. `netsh int ipv4 show excludedportrange protocol=tcp` lists the reserved
  ranges. To keep the port free for the app, open a Command Prompt as administrator and run `net stop winnat`,
  then `netsh int ipv4 add excludedportrange protocol=tcp startport=17500 numberofports=1 store=persistent`,
  then `net start winnat`, and restart the computer.
- **Its server stopped as it started** — the words after it say why; **Open log file** in the tray shows the
  rest.

The desktop app starts the server itself: the tray's **Restart server** starts it again and **Open log file**
shows why it stopped.
Headless, start it with `just-direct-server serve` (`npm run server` from a source checkout).
The app won't open without its server: there is no offline mode to lose work in.

**Another copy is already running.** One server per data folder: a second one says that another
JustDirect server is using this data folder. Quit the other copy (the tray's **Quit JustDirect**), or
give the second one its own `--data-dir` (a folder that already exists — one that isn't there is refused).

**"The data is being moved — quit when it's done".** A **Change folder…** is still copying: wait for it to
finish — the app restarts on the new folder. If the move stops ("The data couldn't be copied to …" — a FAT32
drive takes no file over 4 GB), nothing changed: the data stays where it was.

**Plan the shots fails: "No model is set".** No language model is set up yet: open **AI Settings** and run
Quick Setup (on an 8 GB graphics card it picks Gemma 4 26B-A4B, the model the planner was tested with), or add
an online provider and make it the default. The **AI tasks** panel keeps the failed request with its reason
and **Retry**.

**A feature says its engine isn't installed or its model isn't downloaded.** The banner where the feature is
used offers both, with their sizes; the AI page's tabs (**Images**, **Speech**, **FFmpeg**) do the same.

**"JustVoice isn't running".** The voices come from JustVoice: open it (or start its server with
`justvoice-server serve`), then press **Check again** on the Shots tab. The message names the address
JustDirect looked at — if JustVoice listens elsewhere, put its address in **App Settings → General →
Voices**. A voice JustVoice refuses (a language its models don't speak, a model that doesn't allow
commercial use) is said in JustVoice's own words.

**Export the film: "FFmpeg isn't installed".** The film is joined with FFmpeg: install it on the AI page's
**FFmpeg** tab, or name your own FFmpeg there.

**Make the film: "Something the film needs isn't installed".** The message names what's missing — the
picture model, the clip model or FFmpeg — before anything starts: install each on the AI page, then press
**Make the film** again. If a run stops part way (a clip failed, or you stopped it on the **AI tasks**
strip), **Make the film** again carries on from where it stopped: it never makes again what is already there.

**Repair lips isn't on a talking clip.** It's off until you turn on **Offer lip repair on talking clips** in
**App Settings → General → Clips** (its face models are for non-commercial research only). "This clip is too
long to repair": lip repair takes about 6 seconds of a 1280 × 704 clip at most, and a talking clip runs as
long as its line — give the shot a shorter line (or split it over two shots), or keep the clip as LTX-2.3
drew it.

**A repaired clip has a mouth floating beside the face.** Lip repair finds a face turned toward the camera; a
face seen in profile — two people facing each other, side-on — is outside what it handles, and it can draw a
mouth in the air in front of it. The old clip is kept: press **Use this one** on it, then **Delete** the
repaired one. For a talking shot you want repaired, plan the speaker facing the camera.

**The first frames weren't checked.** The vision model (Qwen3-VL 8B) isn't set up: the frames are painted and
the first one used. Download it on the AI page to have the best of each set chosen for you.

**A model won't load.** Its bar on AI Settings shows why. Usually the model needs more memory than
the computer has free — pick a smaller one, or unload another model first. **Settings → Logs**
has the engine's own words.

**"… was unloaded to make room for …".** The graphics card holds only so much: loading one model took the memory
another was using, so the app unloaded that one. It loads again the next time it's needed. A model that is working
right then is never unloaded — on the AI Settings memory strip its cell says **busy**. While the AI model isn't in
memory, its cell says what it takes when it loads (**~4.1 GB on demand**), or **cloud** when your AI features run on
an online provider.

**A message showed a reference.** The reference finds the matching line in **Settings → Logs**:
the server writes every failure there under the same reference, and this window's own errors land
there too.

**Where are the logs?** **Settings → Logs** shows them live; the files are in the data folder's
`logs` folder, one per day.
