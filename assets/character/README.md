# Login page character (Mixamo)

`loginPage.html` uses a Mixamo 3D character when the files below are in this folder.
If the character or the required animations are missing, the page plays the built-in cartoon character instead, so the page always works.

**Important:** download every animation with the **same character (Ch33) selected** in Mixamo, so the bone names match (`mixamorig7…`).

## Quickest premium setup (3 downloads)

With **Ch33** selected in Mixamo, download **Walking** (In Place), **Throw** and **Standing Arms Crossed** as FBX, Without Skin. Rename them to `walking.fbx`, `throw.fbx` and `idle.fbx`. That gives the full walk → throw → form-bursts-out intro with the premium character.

## 1. Download from mixamo.com

Sign in at https://www.mixamo.com with a free Adobe account. Mixamo characters and animations are free for commercial use.

1. Open the **Characters** tab and pick a character. Search "business" or "suit" for a businessman look.
2. Open the **Animations** tab. With your character selected, search for each animation below, click it, then click **Download**.
3. In the download box use: **Format: FBX Binary (.fbx)**, **Frames per Second: 30**, **Keyframe Reduction: uniform**.
   - Use **Skin: With Skin** for `character.fbx` only.
   - Use **Skin: Without Skin** for all the others (smaller files, faster page).
   - For **Walking**, tick **In Place**.
4. Rename each downloaded file to the name in the first column and put it in this folder.

| File name (exact) | Mixamo animation to search | Needed? | Used for |
|---|---|---|---|
| `character.glb` *(or `character.fbx`)* | Any animation, e.g. "Idle", downloaded **With Skin** | **Required** | The character itself. A web-optimised `character.glb` is already here (made from `Ch33_nonPBR.fbx`, 54 MB → 11.5 MB, about 4.3 MB gzipped). |
| `walking.fbx` | "Walking" (tick **In Place**) | **Required** | Walking in and stepping to the card |
| `idle.fbx` | "Standing Arms Crossed", "Leaning", or any idle | **Required** | Final pose beside the form |
| `throw.fbx` | "Throw" (or "Throwing") | **Recommended** | He throws the suitcase; it spins through the air, lands, bursts open and the login form springs out |
| `put_down.fbx` | "Picking Up Object" or "Put Down" | Optional | Setting the briefcase down |
| `looking_around.fbx` | "Looking Around" | Optional | Looking left and right |
| `snap.fbx` | "Snap Fingers", or "Thinking" | Optional | The idea moment (orange sparks are added at the hand) |
| `jump.fbx` | "Jump" | Optional | The hop; the form pops out of the briefcase when he lands |
| `shaking_head_no.fbx` | "Shaking Head No" | Optional | Wrong email or password |
| `cheering.fbx` | "Cheering" | Optional | Successful sign-in |
| `cover_eyes.fbx` | Any animation with hands over the face | Optional | While the password is typed |

Any optional file that's missing is skipped. Without it he turns his head instead: he looks away for the password and shakes his head for errors.

## 2. Check it

Open `loginPage.html` through a local web server (not by double-clicking the file). For example, run `python3 -m http.server` in the project folder and visit http://localhost:8000/loginPage.html. The 3D character should walk in. If you still see the cartoon, check the file names above.

## Files in this folder

- `mixamo-player.js`: plays the character (three.js + FBXLoader). You don't need to edit it.
- The `.fbx` files you add.
