# Projector Wall

A static page for projecting looping GIFs, videos, web pages and black masks onto a wall.
It's plain HTML, CSS and JS, so there's no build step.

```
index.html   page shell (don't need to touch)
style.css    styles
app.js       the engine
config.js    THE LAYOUT, which is the only file you normally edit
media/       put your GIFs, videos and images here
```

## Hosting on GitHub Pages

1. Push this folder to a GitHub repo.
2. In the repo, go to **Settings → Pages → Source: Deploy from a branch → `main` / root**.
3. Open `https://<user>.github.io/<repo>/` on the projector computer and press **F** for fullscreen.

After you push a change, refresh the page. Pages can take about a minute to redeploy.
To try it locally, double-click `index.html`.

## Keys

| Key | Action |
|---|---|
| **F** / double-click | Fullscreen |
| **E** | Edit mode: shows zone outlines and lets you drag and resize |
| **G** | Alignment grid (100 px squares, green stage border) |
| **C** | (edit) Copy the updated `config.js` to the clipboard |
| **D** | (edit) Download the updated `config.js` |
| Arrows / Shift / Alt | (edit) Nudge position, ×10, or resize |
| Tab | (edit) Select the next zone |
| R | (edit) Reset the selected zone's warp |
| H | (edit) Show / hide the help panel |
| **Ctrl+Z** / ↶ Undo button | (edit) Undo the last move, resize, nudge or warp |

You can also add `?edit` or `?grid` to the URL to start in that mode.

**Calibration workflow:** open the page on the projector, press **E**, and drag zones until they
line up with the wall. Drag the pink corner dots to keystone (corner-pin) a zone. Then press **C** and
paste the result over `config.js`, or press **D** and replace the file. Push.
Edits made in the browser are *not* saved anywhere until you do this.

## config.js

```js
window.CONFIG = {
  stage: { width: 1080, height: 1920, fit: "contain" }, // portrait; match the projector's resolution. fit "stretch" fills the screen exactly
  mediaFolder: "media/",
  reloadMinutes: 0,      // >0 auto-refreshes the page so it picks up pushes on its own
  zones: [ ... ]
};
```

### Zone options

Every zone needs `x, y, w, h` in stage pixels. The `type` is guessed from `src` if you leave it out.

| Option | Meaning |
|---|---|
| `id` | Name shown in edit mode |
| `src` | File in `media/` (`"fish.gif"`) or a full URL |
| `type` | `image`, `video`, `iframe`, `black`, `color`, `placeholder`, or omit |
| `fit` | `cover` (fill and crop, the default), `contain` (letterbox), `fill` (stretch) |
| `position` | Which part stays visible when `cover` crops it, e.g. `"50% 0%"` = keep the top |
| `crop` | `[top, right, bottom, left]` in % of the media, e.g. `[10, 0, 10, 0]` trims 10% top and bottom |
| `speed` | Video playback rate (`0.5`, `2`) |
| `zoom` | iframe only: `0.5` renders the page twice as big, then shrinks it to fit |
| `color` | For `color` / `placeholder` |
| `warp` | Corner-pin offsets `[[x,y] TL, [x,y] TR, [x,y] BR, [x,y] BL]` in px. Easiest to set by dragging in edit mode |
| `transform` | Raw CSS transform when there's no warp, e.g. `"rotate(2deg)"` |
| `opacity`, `z` | Transparency and stacking order (later zones draw on top by default) |

### Examples

```js
{ id: "logo", x: 100, y: 100, w: 400, h: 400, src: "logo.gif" },
{ id: "reel", x: 600, y: 100, w: 800, h: 450, src: "reel.mp4", fit: "contain" },
{ id: "site", x: 1450, y: 100, w: 400, h: 800, src: "https://example.com", zoom: 0.6 },
{ id: "hide-outlet", x: 300, y: 900, w: 120, h: 80, type: "black" },

// Cycles on a timer. A video with no duration plays to the end, then moves on.
{ id: "rotation", x: 600, y: 600, w: 800, h: 400, duration: 8, fade: 1, shuffle: false,
  items: [
    { src: "rotation/project1.jpg" },
    { src: "rotation/project2.gif", duration: 12 },
    { src: "rotation/walkthrough.mp4" }
  ] },
```

## Gotchas

- **A static site can't list a folder**, so each file in a cycling zone has to be named in `items`.
- **Big GIFs are heavy.** Converting them to MP4/WebM looks the same and runs much smoother.
  To convert with ffmpeg: `ffmpeg -i in.gif -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" out.mp4`
- **Videos are always muted.** Browsers block autoplay with sound.
- **Some websites refuse to be embedded** (YouTube watch pages, Google and many others). They show up blank or as an error.
  For YouTube, use the embed URL: `https://www.youtube.com/embed/ID?autoplay=1&mute=1&loop=1&playlist=ID&controls=0`.
- **Kiosk launch** (optional): `chrome --kiosk --autoplay-policy=no-user-gesture-required https://<user>.github.io/<repo>/`
