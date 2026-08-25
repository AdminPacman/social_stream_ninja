# Going Live — Love's Daily Runbook

*The card for going live on YouTube (Daily Lives with Love). Everything here is
set up once, then every day is just the last section. If something on this card
doesn't match what you see, stop and tell Pac — don't improvise around it.*

## The one rule that matters

**Your stream key lives in OBS. Nowhere else.** Not in the SSN app, not in a
website, not in a file, not in a message. If anything ever asks you to paste
your stream key somewhere that isn't OBS's own settings, that's a red flag —
stop and tell Pac.

## Set up once (Pac helps with this part)

1. **OBS holds the key.** In OBS: *Settings → Stream*. The YouTube stream key
   is pasted there once. After that, nobody needs to see it again.
2. **SSN knows your channel.** In the SSN app, add your YouTube source with the
   **owner** option (Add source → YouTube → sign in as the channel owner). Do
   this once; from then on, when you're live, your chat just appears in the
   app on its own. You never hunt for video links.
3. **Your camera and scenes are standing links.** The vdo.ninja room and the
   scene/camera links you use every show are saved as browser sources inside
   your OBS scenes already. Going live never means rebuilding a scene.
4. **The remote-control bridge is armed.** One of your OBS scenes carries a
   hidden browser source pointed at SSN's `actions.html` page (Pac sets the
   `&obsws=` address — it's how SSN is allowed to press buttons *inside* OBS
   on your behalf). Keep that source in place. No key of any kind rides on it.
5. **Going to more than one place at once (multistream).** We do this inside
   OBS with the **Aitum** plugin — it lets OBS send the same show to several
   destinations at once. This is proven on our rig. Every destination's key
   lives in OBS/Aitum's own settings — **never in SSN**. (A relay service is a
   later chapter; it isn't needed for this to work.)

## Every day (this is the whole job)

1. Open OBS. Check you're on the scene you want to open with.
2. Open the SSN app — it's your deck: chat, alerts, and the **ON AIR strip**
   at the top of the analytics panel.
3. Go live **your choice of two ways** — both are equally right:
   - **Press "Start Streaming" in OBS yourself.** The deck notices on its own:
     the strip flips to **ON AIR** and your chat starts flowing in.
   - **Or type `!golive` in chat** (mods can do this too — nobody else can).
     That switches OBS to the live scene and starts the stream for you.
     Type **`!golive off`** to end the stream from chat.
4. Say hi. Everything else — chat, alerts, viewer numbers — is already on the
   deck.

## What the ON AIR strip is telling you

- **ON AIR** — OBS really is streaming right now (OBS itself told the deck).
- **OFF AIR** — the stream is stopped; the deck saw it stop.
- **— (dash)** — the deck *can't see* OBS right now, so it honestly says
  nothing instead of guessing. Almost always this means the `actions.html`
  bridge source (setup step 4) isn't loaded. It does **not** necessarily mean
  you're offline — if OBS says you're streaming, you are. Tell Pac if the dash
  won't go away.

## If something feels wrong mid-show

- Chat not appearing? You're probably fine on air — check the OBS stream
  indicator; the SSN owner source (step 2) re-attaches by itself.
- `!golive` did nothing? The bridge source (step 4) is the usual suspect.
  Press Start in OBS by hand — that's always the fallback, and it's the same
  button either way.
- When in doubt: **OBS is the truth.** The deck reflects OBS; it never
  overrides it.
